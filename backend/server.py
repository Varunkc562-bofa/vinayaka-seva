"""Vinayaka Seva - Ganesh Chaturthi Committee backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Header, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, uuid, logging, httpx, json, requests
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

# ---------- Object Storage ----------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "vinayaka-seva"
_storage_key: Optional[str] = None

def _init_storage() -> Optional[str]:
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
    except Exception as e:
        logging.getLogger("vinayaka").warning("storage init failed: %s", e)
        _storage_key = None
    return _storage_key

def _put_object(path: str, data: bytes, content_type: str):
    key = _init_storage()
    if not key:
        raise RuntimeError("storage_unavailable")
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if r.status_code == 503:
        # stale key: reset once, try again
        globals()["_storage_key"] = None
        key = _init_storage()
        if not key:
            raise RuntimeError("storage_unavailable")
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def _get_object(path: str):
    key = _init_storage()
    if not key:
        raise RuntimeError("storage_unavailable")
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"storage_get_failed_{r.status_code}")
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

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
    amount: float                # pledged amount
    paid_amount: Optional[float] = None  # actual paid (defaults to amount if None)
    mode: str = "cash"
    note: Optional[str] = ""
    phone: Optional[str] = None
    send_sms: bool = True

class DonationEdit(BaseModel):
    donor_name: Optional[str] = None
    amount: Optional[float] = None
    paid_amount: Optional[float] = None
    mode: Optional[str] = None
    note: Optional[str] = None
    phone: Optional[str] = None

class ExpenseEdit(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None
    vendor: Optional[str] = None
    bill_url: Optional[str] = None
    description: Optional[str] = None

class SmsConfigIn(BaseModel):
    enabled: bool = False
    provider: str = "twilio"  # twilio | msg91
    committee_name: str = "Hanuman youth"
    template: str = "🙏 Namaste {donor}! {committee} received your kind contribution of ₹{amount}. Ganpati Bappa Morya!"
    twilio_sid: Optional[str] = None
    twilio_token: Optional[str] = None
    twilio_from: Optional[str] = None
    msg91_authkey: Optional[str] = None
    msg91_sender: Optional[str] = None

class RsvpIn(BaseModel):
    status: str = "yes"  # yes | maybe | no
    plus_ones: int = 0

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
    image_url: Optional[str] = None

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
def _send_sms_background(donation: dict):
    """Non-blocking SMS send. Reads live config from Mongo."""
    from pymongo import MongoClient
    try:
        pc = MongoClient(mongo_url)
        pdb = pc[os.environ["DB_NAME"]]
        cfg = pdb.config.find_one({"key": "sms"}) or {}
        pc.close()
    except Exception as e:
        logger.warning("sms cfg read failed: %s", e)
        return
    if not cfg.get("enabled"):
        return
    phone = donation.get("phone")
    if not phone or len(phone.strip()) < 6:
        return
    tmpl = cfg.get("template") or "Thank you {donor} for ₹{amount}"
    body = tmpl.format(donor=donation.get("donor_name", "Sevak"),
                       amount=int(donation.get("amount", 0)),
                       committee=cfg.get("committee_name", "Committee"))
    provider = cfg.get("provider", "twilio")
    log = {"donation_id": donation.get("donation_id"), "phone": phone, "at": now_utc(),
           "provider": provider, "body": body}
    try:
        if provider == "twilio":
            sid, token, sender = cfg.get("twilio_sid"), cfg.get("twilio_token"), cfg.get("twilio_from")
            if not (sid and token and sender):
                log["status"] = "skipped"; log["reason"] = "twilio_not_configured"
            else:
                r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                    auth=(sid, token),
                    data={"From": sender, "To": phone, "Body": body}, timeout=15)
                log["status"] = "sent" if r.ok else "failed"
                log["provider_status"] = r.status_code
                log["response"] = r.text[:400]
        elif provider == "msg91":
            key, sender = cfg.get("msg91_authkey"), cfg.get("msg91_sender") or "TXTLCL"
            if not key:
                log["status"] = "skipped"; log["reason"] = "msg91_not_configured"
            else:
                r = requests.post("https://api.msg91.com/api/v5/flow/",
                    headers={"authkey": key, "content-type": "application/json"},
                    json={"sender": sender, "route": "4", "country": "91",
                          "sms": [{"message": body, "to": [phone.lstrip("+").lstrip("91")]}]},
                    timeout=15)
                log["status"] = "sent" if r.ok else "failed"
                log["provider_status"] = r.status_code
                log["response"] = r.text[:400]
        else:
            log["status"] = "skipped"; log["reason"] = "unknown_provider"
    except Exception as e:
        log["status"] = "error"; log["error"] = str(e)[:400]
    try:
        pc = MongoClient(mongo_url); pdb = pc[os.environ["DB_NAME"]]
        pdb.sms_logs.insert_one(log); pc.close()
    except Exception:
        pass

@api.get("/donations")
async def list_donations(user: dict = Depends(get_current_user)):
    items = await db.donations.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [clean(d) for d in items]

@api.post("/donations")
async def create_donation(body: DonationIn, user: dict = Depends(get_current_user)):
    d = body.dict()
    send_sms = d.pop("send_sms", True)
    # paid_amount defaults to full amount (i.e. complete)
    if d.get("paid_amount") is None:
        d["paid_amount"] = float(d.get("amount") or 0)
    d["paid_amount"] = max(0.0, min(float(d["paid_amount"]), float(d["amount"])))
    d["donation_id"] = uid("don")
    d["created_at"] = now_utc()
    d["created_by"] = user["name"]
    await db.donations.insert_one(d)
    resp = clean({**d})
    if send_sms and d.get("phone"):
        import asyncio
        asyncio.get_event_loop().run_in_executor(None, _send_sms_background, {**d, "created_at": d["created_at"].isoformat()})
    return resp

@api.patch("/donations/{donation_id}")
async def edit_donation(donation_id: str, body: DonationEdit, user: dict = Depends(get_current_user)):
    cur = await db.donations.find_one({"donation_id": donation_id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "not_found")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "no_changes")
    # Guard paid_amount within [0, amount]
    new_amount = float(update.get("amount", cur.get("amount", 0)))
    new_paid = float(update.get("paid_amount", cur.get("paid_amount", new_amount)))
    new_paid = max(0.0, min(new_paid, new_amount))
    update["amount"] = new_amount
    update["paid_amount"] = new_paid
    update["updated_at"] = now_utc()
    await db.donations.update_one({"donation_id": donation_id}, {"$set": update})
    return clean(await db.donations.find_one({"donation_id": donation_id}, {"_id": 0}))

@api.delete("/donations/{donation_id}")
async def delete_donation(donation_id: str, user: dict = Depends(get_current_user)):
    cur = await db.donations.find_one({"donation_id": donation_id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "not_found")
    result = await db.donations.delete_one({"donation_id": donation_id})
    return {"ok": True, "deleted": result.deleted_count}

@api.get("/pending-dues")
async def pending_dues(user: dict = Depends(get_current_user)):
    items = await db.donations.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    out = []
    for d in items:
        amt = float(d.get("amount") or 0)
        paid = float(d.get("paid_amount", amt))
        remaining = amt - paid
        if remaining > 0.01:
            out.append({**clean(d), "remaining": remaining, "paid_amount": paid, "amount": amt})
    return out

# ---------- SMS Config ----------
@api.get("/config/sms")
async def get_sms_config(user: dict = Depends(require_role("President", "Treasurer", "Secretary"))):
    cfg = await db.config.find_one({"key": "sms"}, {"_id": 0}) or {}
    # Hide sensitive tokens in read
    if cfg.get("twilio_token"):
        cfg["twilio_token_set"] = True; cfg.pop("twilio_token", None)
    if cfg.get("msg91_authkey"):
        cfg["msg91_authkey_set"] = True; cfg.pop("msg91_authkey", None)
    return clean(cfg)

@api.put("/config/sms")
async def set_sms_config(body: SmsConfigIn,
        user: dict = Depends(require_role("President", "Treasurer", "Secretary"))):
    doc = body.dict()
    # If sensitive fields sent empty, don't overwrite existing
    current = await db.config.find_one({"key": "sms"}, {"_id": 0}) or {}
    for k in ("twilio_token", "twilio_sid", "twilio_from", "msg91_authkey", "msg91_sender"):
        if not doc.get(k) and current.get(k):
            doc[k] = current[k]
    doc["key"] = "sms"; doc["updated_at"] = now_utc()
    await db.config.update_one({"key": "sms"}, {"$set": doc}, upsert=True)
    return {"ok": True}

@api.post("/config/sms/test")
async def test_sms(payload: Dict[str, Any],
        user: dict = Depends(require_role("President", "Treasurer", "Secretary"))):
    phone = payload.get("phone")
    if not phone:
        raise HTTPException(400, "phone_required")
    fake = {"donation_id": "test", "donor_name": user["name"], "amount": 100, "phone": phone}
    await run_in_threadpool(_send_sms_background, fake)
    last = await db.sms_logs.find_one({"donation_id": "test", "phone": phone}, {"_id": 0}, sort=[("at", -1)])
    return clean(last) or {"status": "unknown"}

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

@api.patch("/expenses/{expense_id}")
async def edit_expense(expense_id: str, body: ExpenseEdit, user: dict = Depends(get_current_user)):
    cur = await db.expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "not_found")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if not update:
        raise HTTPException(400, "no_changes")
    update["updated_at"] = now_utc()
    await db.expenses.update_one({"expense_id": expense_id}, {"$set": update})
    return clean(await db.expenses.find_one({"expense_id": expense_id}, {"_id": 0}))

@api.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(get_current_user)):
    cur = await db.expenses.find_one({"expense_id": expense_id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "not_found")
    result = await db.expenses.delete_one({"expense_id": expense_id})
    return {"ok": True, "deleted": result.deleted_count}

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

# ---------- Event RSVPs (Prasadam Roster) ----------
@api.get("/events/{event_id}/rsvps")
async def list_rsvps(event_id: str, user: dict = Depends(get_current_user)):
    items = await db.rsvps.find({"event_id": event_id}, {"_id": 0}).to_list(500)
    return [clean(r) for r in items]

@api.post("/events/{event_id}/rsvp")
async def upsert_rsvp(event_id: str, body: RsvpIn, user: dict = Depends(get_current_user)):
    if body.status not in ("yes", "maybe", "no"):
        raise HTTPException(400, "bad_status")
    doc = {
        "event_id": event_id, "user_id": user["user_id"], "user_name": user["name"],
        "user_role": user["role"], "status": body.status,
        "plus_ones": max(0, int(body.plus_ones or 0)), "at": now_utc(),
    }
    await db.rsvps.update_one(
        {"event_id": event_id, "user_id": user["user_id"]},
        {"$set": doc}, upsert=True,
    )
    return {"ok": True}

@api.get("/rsvp/summary")
async def rsvp_summary(user: dict = Depends(get_current_user)):
    """For each upcoming event, return yes/maybe/no counts + total headcount (yes + plus_ones)."""
    events = await db.events.find({}, {"_id": 0}).sort("starts_at", 1).to_list(200)
    out = []
    for e in events:
        rsvps = await db.rsvps.find({"event_id": e["event_id"]}, {"_id": 0}).to_list(500)
        yes = [r for r in rsvps if r.get("status") == "yes"]
        maybe = [r for r in rsvps if r.get("status") == "maybe"]
        no = [r for r in rsvps if r.get("status") == "no"]
        headcount = sum(1 + int(r.get("plus_ones") or 0) for r in yes)
        out.append({**clean(e), "yes": len(yes), "maybe": len(maybe), "no": len(no),
                    "headcount": headcount, "yes_list": [
                        {"user_name": r.get("user_name"), "user_role": r.get("user_role"),
                         "plus_ones": r.get("plus_ones", 0)} for r in yes]})
    return out

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
    # Collected = paid amounts only. Pending dues = pledged - paid.
    total_donations = 0.0
    pending_dues_total = 0.0
    pending_dues_count = 0
    for d in donations:
        amt = float(d.get("amount") or 0)
        paid = float(d.get("paid_amount", amt))
        total_donations += paid
        rem = amt - paid
        if rem > 0.01:
            pending_dues_total += rem
            pending_dues_count += 1
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
        "pending_dues_total": pending_dues_total,
        "pending_dues_count": pending_dues_count,
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

# ---------- Uploads / Files ----------
@api.post("/upload")
async def upload_file(file: UploadFile = File(...),
                      folder: str = Query("misc"),
                      user: dict = Depends(get_current_user)):
    ext = ""
    if file.filename and "." in file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower()
    path = f"{APP_NAME}/uploads/{folder}/{user['user_id']}/{uuid.uuid4().hex}{ext}"
    content = await file.read()
    ct = file.content_type or "application/octet-stream"
    try:
        await run_in_threadpool(_put_object, path, content, ct)
    except Exception as e:
        raise HTTPException(502, f"upload_failed: {e}")
    await db.uploads.insert_one({
        "upload_id": uid("up"), "storage_path": path, "owner_id": user["user_id"],
        "owner_name": user["name"], "content_type": ct, "size": len(content),
        "folder": folder, "original_name": file.filename, "created_at": now_utc(),
    })
    return {"storage_path": path, "url": f"/api/files/{path}", "size": len(content)}

@api.get("/files/{full_path:path}")
async def download_file(full_path: str, token: Optional[str] = Query(None),
                        authorization: Optional[str] = Header(None)):
    # Accept token via header OR query param (web <img>)
    session_token = None
    if authorization and authorization.startswith("Bearer "):
        session_token = authorization.split(" ", 1)[1]
    elif token:
        session_token = token
    if not session_token:
        raise HTTPException(401, "Missing token")
    sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    # Any authenticated committee member can view files
    try:
        data, ct = await run_in_threadpool(_get_object, full_path)
    except Exception:
        raise HTTPException(404, "not_found")
    return Response(content=data, media_type=ct, headers={"Cache-Control": "private, max-age=86400"})

# ---------- Gallery ----------
class GalleryIn(BaseModel):
    storage_path: str
    caption: Optional[str] = ""
    category: str = "general"  # aarti, decoration, cultural, annadanam, general

@api.get("/gallery")
async def gallery_list(user: dict = Depends(get_current_user)):
    items = await db.gallery.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [clean(x) for x in items]

@api.post("/gallery")
async def gallery_add(body: GalleryIn, user: dict = Depends(get_current_user)):
    doc = body.dict()
    doc["photo_id"] = uid("ph")
    doc["created_at"] = now_utc()
    doc["by_id"] = user["user_id"]
    doc["by_name"] = user["name"]
    await db.gallery.insert_one(doc)
    return clean({**doc})

@api.delete("/gallery/{photo_id}")
async def gallery_delete(photo_id: str, user: dict = Depends(get_current_user)):
    doc = await db.gallery.find_one({"photo_id": photo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "not_found")
    if doc.get("by_id") != user["user_id"] and user.get("role") not in ("President", "Vice President", "Secretary"):
        raise HTTPException(403, "not_your_photo")
    await db.gallery.update_one({"photo_id": photo_id}, {"$set": {"deleted_at": now_utc()}})
    await db.gallery.delete_one({"photo_id": photo_id})
    return {"ok": True}

# ---------- Polls / Committee Decisions ----------
class PollIn(BaseModel):
    question: str
    options: List[str]
    anonymous: bool = False
    closes_at: Optional[str] = None

class PollVote(BaseModel):
    option_index: int

@api.get("/polls")
async def polls_list(user: dict = Depends(get_current_user)):
    items = await db.polls.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for p in items:
        p = clean(p) or {}
        votes = p.get("votes", [])
        my_vote = next((v.get("option_index") for v in votes if v.get("user_id") == user["user_id"]), None)
        counts = [0] * len(p.get("options", []))
        for v in votes:
            idx = v.get("option_index", -1)
            if 0 <= idx < len(counts):
                counts[idx] += 1
        # Hide voter identity if anonymous
        display_votes = [] if p.get("anonymous") else [
            {"user_name": v.get("user_name"), "user_role": v.get("user_role"),
             "option_index": v.get("option_index"), "at": v.get("at")}
            for v in votes
        ]
        out.append({**p, "counts": counts, "total_votes": len(votes),
                    "my_vote": my_vote, "voters": display_votes})
    return out

@api.post("/polls")
async def polls_create(body: PollIn, user: dict = Depends(get_current_user)):
    if len(body.options) < 2:
        raise HTTPException(400, "min_two_options")
    doc = {
        "poll_id": uid("poll"),
        "question": body.question,
        "options": body.options,
        "anonymous": body.anonymous,
        "closes_at": body.closes_at,
        "created_at": now_utc(),
        "created_by_id": user["user_id"],
        "created_by_name": user["name"],
        "created_by_role": user["role"],
        "votes": [],
        "status": "open",
    }
    await db.polls.insert_one(doc)
    return clean({**doc, "counts": [0] * len(body.options), "total_votes": 0, "my_vote": None, "voters": []})

@api.post("/polls/{poll_id}/vote")
async def polls_vote(poll_id: str, body: PollVote, user: dict = Depends(get_current_user)):
    poll = await db.polls.find_one({"poll_id": poll_id}, {"_id": 0})
    if not poll:
        raise HTTPException(404, "poll_not_found")
    if poll.get("status") != "open":
        raise HTTPException(400, "poll_closed")
    if body.option_index < 0 or body.option_index >= len(poll.get("options", [])):
        raise HTTPException(400, "bad_option")
    # one vote per user (upsert-style)
    await db.polls.update_one({"poll_id": poll_id},
        {"$pull": {"votes": {"user_id": user["user_id"]}}})
    await db.polls.update_one({"poll_id": poll_id},
        {"$push": {"votes": {
            "user_id": user["user_id"],
            "user_name": user["name"],
            "user_role": user["role"],
            "option_index": body.option_index,
            "at": now_utc().isoformat(),
        }}})
    return {"ok": True}

@api.post("/polls/{poll_id}/close")
async def polls_close(poll_id: str, user: dict = Depends(get_current_user)):
    poll = await db.polls.find_one({"poll_id": poll_id}, {"_id": 0})
    if not poll:
        raise HTTPException(404, "poll_not_found")
    if poll.get("created_by_id") != user["user_id"] and user.get("role") not in ("President", "Vice President", "Secretary"):
        raise HTTPException(403, "not_allowed")
    await db.polls.update_one({"poll_id": poll_id}, {"$set": {"status": "closed", "closed_at": now_utc()}})
    return {"ok": True}

# ---------- Include router ----------
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
    try:
        _init_storage()
    except Exception as e:
        logger.warning("storage init on startup: %s", e)
    logger.info("Vinayaka Seva ready")

@app.on_event("shutdown")
async def on_stop():
    client.close()
