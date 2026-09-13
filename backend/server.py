"""Vinayaka Seva - Ganesh Chaturthi Committee backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, uuid, logging, httpx, json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

app = FastAPI(title="Vinayaka Seva API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vinayaka")

# ---------- Utility ----------
def uid(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def clean(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return doc
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

# ---------- Models ----------
ROLES = [
    "President", "Vice President", "Secretary", "Joint Secretary", "Treasurer",
    "Pooja Coordinator", "Volunteer Coordinator", "Food Coordinator",
    "Decoration Coordinator", "Cultural Coordinator", "Security Coordinator",
    "Media Coordinator", "General Committee Member", "Volunteer", "Regular Member",
]

class SessionExchange(BaseModel):
    session_id: str

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "Regular Member"
    phone: Optional[str] = None

class RoleUpdate(BaseModel):
    role: str

class TaskIn(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: str = "medium"  # low, medium, high, critical
    status: str = "todo"       # todo, doing, done
    due_at: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    photo_url: Optional[str] = None

class TaskComment(BaseModel):
    text: str

class DonationIn(BaseModel):
    donor_name: str
    amount: float
    mode: str = "cash"  # cash, upi, bank
    note: Optional[str] = ""
    phone: Optional[str] = None

class ExpenseIn(BaseModel):
    amount: float
    category: str  # decoration, pooja, food, cultural, security, misc
    vendor: Optional[str] = ""
    bill_url: Optional[str] = None
    description: Optional[str] = ""
    approved: bool = False

class AnnouncementIn(BaseModel):
    title: str
    body: str
    pinned: bool = False

class EventIn(BaseModel):
    title: str
    description: Optional[str] = ""
    starts_at: str
    location: Optional[str] = ""
    category: str = "cultural"  # pooja, cultural, annadanam, general

class VolunteerShiftIn(BaseModel):
    volunteer_id: str
    volunteer_name: str
    role: str
    starts_at: str
    ends_at: str
    location: Optional[str] = ""

class AIChatIn(BaseModel):
    question: str
    session_id: Optional[str] = None

class FestivalConfig(BaseModel):
    festival_start: str  # ISO date

# ---------- Auth helpers ----------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = session.get("expires_at")
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            raise HTTPException(status_code=401, detail="Expired session")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dep

# ---------- Auth ----------
@api.post("/auth/session")
async def auth_session(body: SessionExchange):
    async with httpx.AsyncClient(timeout=15) as hx:
        r = await hx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        role = existing.get("role", "Regular Member")
    else:
        user_id = uid("user")
        # First registered user becomes President for demo
        count = await db.users.count_documents({})
        role = "President" if count == 0 else "Regular Member"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "role": role,
            "phone": None,
            "created_at": now_utc(),
        })

    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=7),
        "created_at": now_utc(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": clean(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean(user)

@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}

# ---------- Members / Roles ----------
@api.get("/members")
async def list_members(user: dict = Depends(get_current_user)):
    items = await db.users.find({}, {"_id": 0}).to_list(500)
    return [clean(m) for m in items]

@api.patch("/members/{member_id}/role")
async def update_role(member_id: str, body: RoleUpdate,
                     user: dict = Depends(require_role("President", "Vice President", "Secretary"))):
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    await db.users.update_one({"user_id": member_id}, {"$set": {"role": body.role}})
    return {"ok": True}

@api.get("/roles")
async def get_roles():
    return {"roles": ROLES}

# ---------- Festival config ----------
@api.get("/config/festival")
async def get_festival():
    cfg = await db.config.find_one({"key": "festival"}, {"_id": 0})
    if not cfg:
        # Default: next Ganesh Chaturthi (approx Aug 27, 2026)
        cfg = {"key": "festival", "festival_start": "2026-08-27T06:00:00Z"}
        await db.config.insert_one(cfg)
    return clean(cfg)

@api.put("/config/festival")
async def set_festival(body: FestivalConfig,
                       user: dict = Depends(require_role("President", "Secretary"))):
    await db.config.update_one(
        {"key": "festival"},
        {"$set": {"festival_start": body.festival_start}},
        upsert=True,
    )
    return {"ok": True}

# ---------- Tasks ----------
@api.get("/tasks")
async def list_tasks(mine: bool = False, user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {}
    if mine:
        q["assignee_id"] = user["user_id"]
    items = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [clean(t) for t in items]

@api.post("/tasks")
async def create_task(body: TaskIn, user: dict = Depends(get_current_user)):
    task = body.dict()
    task["task_id"] = uid("task")
    task["created_at"] = now_utc()
    task["created_by"] = user["user_id"]
    task["created_by_name"] = user["name"]
    task["comments"] = []
    task["history"] = [{"at": now_utc().isoformat(), "by": user["name"], "action": "created"}]
    await db.tasks.insert_one(task)
    return clean({**task})

@api.patch("/tasks/{task_id}")
async def update_task(task_id: str, body: Dict[str, Any], user: dict = Depends(get_current_user)):
    body = {k: v for k, v in body.items() if k in {"title", "description", "priority",
              "status", "due_at", "assignee_id", "assignee_name", "photo_url"}}
    if not body:
        raise HTTPException(400, "No valid fields")
    body["updated_at"] = now_utc()
    await db.tasks.update_one({"task_id": task_id}, {
        "$set": body,
        "$push": {"history": {"at": now_utc().isoformat(), "by": user["name"],
                              "action": "updated", "changes": list(body.keys())}},
    })
    t = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    return clean(t)

@api.post("/tasks/{task_id}/comments")
async def add_comment(task_id: str, body: TaskComment, user: dict = Depends(get_current_user)):
    entry = {"comment_id": uid("cm"), "text": body.text, "by": user["name"],
             "by_id": user["user_id"], "at": now_utc().isoformat()}
    await db.tasks.update_one({"task_id": task_id}, {"$push": {"comments": entry}})
    return entry

@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    await db.tasks.delete_one({"task_id": task_id})
    return {"ok": True}

# ---------- Donations ----------
@api.get("/donations")
async def list_donations(user: dict = Depends(get_current_user)):
    items = await db.donations.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [clean(d) for d in items]

@api.post("/donations")
async def create_donation(body: DonationIn, user: dict = Depends(get_current_user)):
    d = body.dict()
    d["donation_id"] = uid("don")
    d["created_at"] = now_utc()
    d["created_by"] = user["name"]
    await db.donations.insert_one(d)
    return clean({**d})

# ---------- Expenses ----------
@api.get("/expenses")
async def list_expenses(user: dict = Depends(get_current_user)):
    items = await db.expenses.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [clean(e) for e in items]

@api.post("/expenses")
async def create_expense(body: ExpenseIn, user: dict = Depends(get_current_user)):
    e = body.dict()
    e["expense_id"] = uid("exp")
    e["created_at"] = now_utc()
    e["created_by"] = user["name"]
    e["created_by_id"] = user["user_id"]
    await db.expenses.insert_one(e)
    return clean({**e})

@api.patch("/expenses/{expense_id}/approve")
async def approve_expense(expense_id: str,
        user: dict = Depends(require_role("President", "Treasurer", "Vice President"))):
    await db.expenses.update_one({"expense_id": expense_id},
        {"$set": {"approved": True, "approved_by": user["name"], "approved_at": now_utc()}})
    return {"ok": True}

# ---------- Announcements ----------
@api.get("/announcements")
async def list_announcements(user: dict = Depends(get_current_user)):
    items = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [clean(a) for a in items]

@api.post("/announcements")
async def create_announcement(body: AnnouncementIn, user: dict = Depends(get_current_user)):
    a = body.dict()
    a["announcement_id"] = uid("ann")
    a["created_at"] = now_utc()
    a["author"] = user["name"]
    a["author_role"] = user["role"]
    await db.announcements.insert_one(a)
    return clean({**a})

# ---------- Events ----------
@api.get("/events")
async def list_events(user: dict = Depends(get_current_user)):
    items = await db.events.find({}, {"_id": 0}).sort("starts_at", 1).to_list(300)
    return [clean(e) for e in items]

@api.post("/events")
async def create_event(body: EventIn, user: dict = Depends(get_current_user)):
    e = body.dict()
    e["event_id"] = uid("evt")
    e["created_at"] = now_utc()
    e["created_by"] = user["name"]
    await db.events.insert_one(e)
    return clean({**e})

# ---------- Volunteer shifts ----------
@api.get("/shifts")
async def list_shifts(user: dict = Depends(get_current_user)):
    items = await db.shifts.find({}, {"_id": 0}).sort("starts_at", 1).to_list(300)
    return [clean(s) for s in items]

@api.post("/shifts")
async def create_shift(body: VolunteerShiftIn, user: dict = Depends(get_current_user)):
    s = body.dict()
    s["shift_id"] = uid("shf")
    s["created_at"] = now_utc()
    await db.shifts.insert_one(s)
    return clean({**s})

# ---------- Dashboard ----------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    donations = await db.donations.find({}, {"_id": 0}).to_list(1000)
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(1000)
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(1000)
    events = await db.events.find({}, {"_id": 0}).sort("starts_at", 1).to_list(50)
    announcements = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    volunteers = await db.users.count_documents({"role": {"$in": ["Volunteer", "Volunteer Coordinator"]}})
    total_donations = sum(d.get("amount", 0) for d in donations)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    pending_tasks = [t for t in tasks if t.get("status") != "done"]
    my_tasks = [t for t in tasks if t.get("assignee_id") == user["user_id"] and t.get("status") != "done"]
    critical = [t for t in pending_tasks if t.get("priority") == "critical"]

    today = now_utc().date()
    todays = [e for e in events if e.get("starts_at", "")[:10] == today.isoformat()]

    cfg = await db.config.find_one({"key": "festival"}, {"_id": 0}) or {}
    return {
        "total_donations": total_donations,
        "total_expenses": total_expenses,
        "balance": total_donations - total_expenses,
        "active_volunteers": volunteers,
        "pending_tasks_count": len(pending_tasks),
        "my_pending_tasks_count": len(my_tasks),
        "critical_issues_count": len(critical),
        "todays_events": [clean(e) for e in todays],
        "recent_announcements": [clean(a) for a in announcements],
        "festival_start": cfg.get("festival_start"),
    }

# ---------- Seva AI ----------
async def build_context(user: dict) -> str:
    donations = await db.donations.find({}, {"_id": 0}).to_list(200)
    expenses = await db.expenses.find({}, {"_id": 0}).to_list(200)
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(200)
    events = await db.events.find({}, {"_id": 0}).to_list(100)
    members = await db.users.find({}, {"_id": 0, "email": 0}).to_list(200)
    ann = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(20)
    ctx = {
        "current_user": {"name": user["name"], "role": user["role"]},
        "totals": {
            "donations": sum(d.get("amount", 0) for d in donations),
            "expenses": sum(e.get("amount", 0) for e in expenses),
        },
        "members": [{"name": m.get("name"), "role": m.get("role")} for m in members],
        "tasks": [{"title": t.get("title"), "status": t.get("status"),
                   "priority": t.get("priority"), "assignee": t.get("assignee_name"),
                   "due_at": t.get("due_at")} for t in tasks],
        "events": [{"title": e.get("title"), "starts_at": e.get("starts_at"),
                    "category": e.get("category")} for e in events],
        "expenses_by_category": {},
        "announcements": [{"title": a.get("title"), "body": a.get("body")} for a in ann[:5]],
    }
    for e in expenses:
        cat = e.get("category", "misc")
        ctx["expenses_by_category"][cat] = ctx["expenses_by_category"].get(cat, 0) + e.get("amount", 0)
    return json.dumps(ctx, default=str)

@api.post("/ai/chat")
async def ai_chat(body: AIChatIn, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "AI not configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    context = await build_context(user)
    session_id = body.session_id or uid("ai")
    system = (
        "You are Seva AI, a warm, respectful assistant for a Ganesh Chaturthi festival "
        "committee. Answer ONLY using the provided committee data (JSON below). "
        "Be concise, friendly, use bullet points when useful. If the data doesn't contain "
        "the answer, say so gently and suggest what to add. Never reveal raw JSON.\n\n"
        f"COMMITTEE DATA:\n{context}"
    )
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id,
                   system_message=system).with_model("gemini", "gemini-3-flash-preview")

    # Save user question
    await db.ai_messages.insert_one({
        "session_id": session_id, "user_id": user["user_id"],
        "role": "user", "text": body.question, "at": now_utc(),
    })

    async def gen():
        buf = ""
        try:
            async for ev in chat.stream_message(UserMessage(text=body.question)):
                if isinstance(ev, TextDelta):
                    buf += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as ex:
            logger.exception("AI error")
            yield f"data: {json.dumps({'error': str(ex)})}\n\n"
        await db.ai_messages.insert_one({
            "session_id": session_id, "user_id": user["user_id"],
            "role": "assistant", "text": buf, "at": now_utc(),
        })
        yield f"data: {json.dumps({'done': True, 'session_id': session_id})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@api.get("/ai/history")
async def ai_history(session_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q: Dict[str, Any] = {"user_id": user["user_id"]}
    if session_id:
        q["session_id"] = session_id
    items = await db.ai_messages.find(q, {"_id": 0}).sort("at", 1).to_list(200)
    return [clean(x) for x in items]

# ---------- Seed demo ----------
@api.post("/dev/seed")
async def seed(user: dict = Depends(require_role("President"))):
    """Seed sample data for demo."""
    await db.donations.delete_many({})
    await db.expenses.delete_many({})
    await db.tasks.delete_many({})
    await db.announcements.delete_many({})
    await db.events.delete_many({})

    now = now_utc()
    donations = [
        {"donation_id": uid("don"), "donor_name": "Ramesh Kulkarni", "amount": 5000,
         "mode": "cash", "note": "Family donation", "created_at": now, "created_by": "System"},
        {"donation_id": uid("don"), "donor_name": "Priya Sharma", "amount": 2100,
         "mode": "upi", "note": "", "created_at": now, "created_by": "System"},
        {"donation_id": uid("don"), "donor_name": "Ganesh Tea Stall", "amount": 1100,
         "mode": "cash", "note": "Business", "created_at": now, "created_by": "System"},
    ]
    await db.donations.insert_many(donations)

    expenses = [
        {"expense_id": uid("exp"), "amount": 3500, "category": "decoration",
         "vendor": "Marigold Mart", "description": "Flowers", "approved": True,
         "created_at": now, "created_by": "System"},
        {"expense_id": uid("exp"), "amount": 2200, "category": "food",
         "vendor": "Sri Krishna Catering", "description": "Annadanam supplies",
         "approved": False, "created_at": now, "created_by": "System"},
    ]
    await db.expenses.insert_many(expenses)

    tasks = [
        {"task_id": uid("task"), "title": "Book pandal decorator",
         "description": "Confirm the marigold and rangoli team", "priority": "high",
         "status": "doing", "due_at": (now + timedelta(days=2)).isoformat(),
         "assignee_id": user["user_id"], "assignee_name": user["name"],
         "created_at": now, "created_by": user["user_id"], "created_by_name": user["name"],
         "comments": [], "history": []},
        {"task_id": uid("task"), "title": "Arrange sound system",
         "description": "Coordinate with cultural coordinator", "priority": "medium",
         "status": "todo", "due_at": (now + timedelta(days=4)).isoformat(),
         "assignee_id": user["user_id"], "assignee_name": user["name"],
         "created_at": now, "created_by": user["user_id"], "created_by_name": user["name"],
         "comments": [], "history": []},
        {"task_id": uid("task"), "title": "Print prasadam labels",
         "description": "500 stickers for laddoos", "priority": "low",
         "status": "done", "due_at": (now - timedelta(days=1)).isoformat(),
         "assignee_id": user["user_id"], "assignee_name": user["name"],
         "created_at": now, "created_by": user["user_id"], "created_by_name": user["name"],
         "comments": [], "history": []},
    ]
    await db.tasks.insert_many(tasks)

    events = [
        {"event_id": uid("evt"), "title": "Ganesha Sthapana (Pran Pratishtha)",
         "description": "Main installation ceremony", "starts_at": (now + timedelta(days=1)).isoformat(),
         "location": "Community Pandal", "category": "pooja",
         "created_at": now, "created_by": "System"},
        {"event_id": uid("evt"), "title": "Cultural Evening",
         "description": "Dance and singing performances", "starts_at": (now + timedelta(days=3)).isoformat(),
         "location": "Main Stage", "category": "cultural",
         "created_at": now, "created_by": "System"},
        {"event_id": uid("evt"), "title": "Annadanam",
         "description": "Community feast", "starts_at": (now + timedelta(days=5)).isoformat(),
         "location": "Community Hall", "category": "annadanam",
         "created_at": now, "created_by": "System"},
    ]
    await db.events.insert_many(events)

    announcements = [
        {"announcement_id": uid("ann"), "title": "Welcome to Vinayaka Seva",
         "body": "Ganpati Bappa Morya! Our committee app is ready. Please add your donations and tasks.",
         "pinned": True, "created_at": now, "author": user["name"], "author_role": user["role"]},
        {"announcement_id": uid("ann"), "title": "Volunteers needed for Aarti",
         "body": "We need 5 volunteers for the evening aarti on Day 2. Please sign up.",
         "pinned": False, "created_at": now, "author": user["name"], "author_role": user["role"]},
    ]
    await db.announcements.insert_many(announcements)
    return {"ok": True, "seeded": True}

# ---------- Root ----------
@api.get("/")
async def root():
    return {"app": "Vinayaka Seva", "ok": True}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_start():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    logger.info("Vinayaka Seva ready")

@app.on_event("shutdown")
async def on_stop():
    client.close()
