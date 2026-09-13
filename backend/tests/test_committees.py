"""Multi-tenancy (committees) tests for Vinayaka Seva.

Covers:
- POST /api/committees (create; auth required; blank name rejected)
- POST /api/committees/join (wrong code 404; correct code sets role)
- POST /api/committees/leave (clears committee_id; role -> Regular Member)
- GET /api/committees/me (null / populated)
- 428 gate on domain endpoints for users without a committee
- Data isolation between committees for all domain resources
- POST /api/dev/seed only affects caller's committee
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ------------- helpers -------------
def _make_bare_user(db, role: str = "Regular Member"):
    """Create a user with NO committee_id, plus a session token."""
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = f"TEST_com_{uuid.uuid4().hex[:6]}@example.com"
    token = f"TEST_tok_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    db.users.insert_one({
        "user_id": user_id, "email": email, "name": f"Test {role}",
        "role": role, "picture": None, "phone": None,
        "committee_id": None, "created_at": now,
    })
    db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "expires_at": now + timedelta(days=1), "created_at": now,
    })
    return {"user_id": user_id, "email": email, "token": token,
            "name": f"Test {role}", "role": role}


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture()
def bare_user(db):
    u = _make_bare_user(db)
    yield u
    db.user_sessions.delete_one({"session_token": u["token"]})
    db.users.delete_one({"user_id": u["user_id"]})


@pytest.fixture()
def user_a(db):
    u = _make_bare_user(db)
    yield u
    db.user_sessions.delete_one({"session_token": u["token"]})
    db.users.delete_one({"user_id": u["user_id"]})


@pytest.fixture()
def user_b(db):
    u = _make_bare_user(db)
    yield u
    db.user_sessions.delete_one({"session_token": u["token"]})
    db.users.delete_one({"user_id": u["user_id"]})


@pytest.fixture()
def user_c(db):
    u = _make_bare_user(db)
    yield u
    db.user_sessions.delete_one({"session_token": u["token"]})
    db.users.delete_one({"user_id": u["user_id"]})


# ---------- Committee CRUD ----------
class TestCommitteeCreate:
    def test_create_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/committees", json={"name": "X"})
        assert r.status_code == 401

    def test_create_blank_name_rejected(self, bare_user):
        r = requests.post(f"{BASE_URL}/api/committees",
                          headers=_hdr(bare_user["token"]), json={"name": "   "})
        assert r.status_code == 400

    def test_create_success_returns_code_and_promotes_president(self, bare_user, db):
        r = requests.post(f"{BASE_URL}/api/committees",
                          headers=_hdr(bare_user["token"]),
                          json={"name": "TEST_Committee_A"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["role"] == "President"
        assert data["name"] == "TEST_Committee_A"
        assert data["committee_id"]
        code = data["code"]
        # 6 chars, uppercase, allowed alphabet (no ambiguous chars)
        assert isinstance(code, str) and len(code) == 6
        assert code == code.upper()
        forbidden = set("O0I1L")
        assert not (set(code) & forbidden), f"code {code} contains forbidden chars"
        # GET /auth/me reflects committee_id + President
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(bare_user["token"]))
        assert me.status_code == 200
        me_d = me.json()
        assert me_d["committee_id"] == data["committee_id"]
        assert me_d["role"] == "President"
        # cleanup
        db.committees.delete_one({"committee_id": data["committee_id"]})


class TestCommitteeJoin:
    def test_join_wrong_code_404(self, bare_user):
        r = requests.post(f"{BASE_URL}/api/committees/join",
                          headers=_hdr(bare_user["token"]),
                          json={"code": "ZZZZZZ"})
        assert r.status_code == 404
        assert r.json().get("detail") == "committee_not_found"

    def test_join_correct_code_regular_member(self, user_a, user_b, db):
        # A creates a committee
        r = requests.post(f"{BASE_URL}/api/committees", headers=_hdr(user_a["token"]),
                          json={"name": "TEST_Join_Com"})
        assert r.status_code == 200
        code = r.json()["code"]
        com_id = r.json()["committee_id"]
        # B joins
        r2 = requests.post(f"{BASE_URL}/api/committees/join",
                           headers=_hdr(user_b["token"]), json={"code": code})
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["role"] == "Regular Member"
        assert d["committee_id"] == com_id
        # GET /committees/me
        me = requests.get(f"{BASE_URL}/api/committees/me", headers=_hdr(user_b["token"]))
        assert me.status_code == 200
        mine = me.json()
        assert mine and mine["committee_id"] == com_id
        assert mine["code"] == code
        assert mine["member_count"] >= 2
        db.committees.delete_one({"committee_id": com_id})


class TestCommitteeLeave:
    def test_leave_clears_committee(self, user_a, db):
        r = requests.post(f"{BASE_URL}/api/committees", headers=_hdr(user_a["token"]),
                          json={"name": "TEST_Leave_Com"})
        cid = r.json()["committee_id"]
        r2 = requests.post(f"{BASE_URL}/api/committees/leave", headers=_hdr(user_a["token"]))
        assert r2.status_code == 200
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_hdr(user_a["token"]))
        j = me.json()
        assert j.get("committee_id") is None
        assert j.get("role") == "Regular Member"
        # /committees/me returns null
        mc = requests.get(f"{BASE_URL}/api/committees/me", headers=_hdr(user_a["token"]))
        assert mc.status_code == 200 and mc.json() is None
        db.committees.delete_one({"committee_id": cid})


class TestMyCommittee:
    def test_me_null_when_no_committee(self, bare_user):
        r = requests.get(f"{BASE_URL}/api/committees/me", headers=_hdr(bare_user["token"]))
        assert r.status_code == 200
        assert r.json() is None


# ---------- 428 gate on domain endpoints ----------
class TestGate428:
    ENDPOINTS = [
        "/api/dashboard", "/api/donations", "/api/tasks", "/api/announcements",
        "/api/events", "/api/gallery", "/api/polls", "/api/members", "/api/rsvp/summary",
    ]

    def test_no_committee_returns_428(self, bare_user):
        failures = []
        for ep in self.ENDPOINTS:
            r = requests.get(f"{BASE_URL}{ep}", headers=_hdr(bare_user["token"]))
            if r.status_code != 428:
                failures.append(f"{ep} -> {r.status_code}")
                continue
            try:
                assert r.json().get("detail") == "no_committee"
            except Exception:
                failures.append(f"{ep} bad body: {r.text[:120]}")
        assert not failures, f"Gate failures: {failures}"


# ---------- Data isolation ----------
class TestIsolation:
    def test_donation_isolation(self, user_a, user_b, db):
        # A creates committee CA + donation
        ra = requests.post(f"{BASE_URL}/api/committees", headers=_hdr(user_a["token"]),
                           json={"name": "TEST_CA"})
        ca_id = ra.json()["committee_id"]
        d = requests.post(f"{BASE_URL}/api/donations", headers=_hdr(user_a["token"]),
                          json={"donor_name": "Isolation Donor A", "amount": 111,
                                "mode": "cash", "send_sms": False})
        assert d.status_code == 200, d.text
        # B creates committee CB
        rb = requests.post(f"{BASE_URL}/api/committees", headers=_hdr(user_b["token"]),
                           json={"name": "TEST_CB"})
        cb_id = rb.json()["committee_id"]
        # B lists donations - must NOT see A's donation
        lb = requests.get(f"{BASE_URL}/api/donations", headers=_hdr(user_b["token"]))
        assert lb.status_code == 200
        names = [x["donor_name"] for x in lb.json()]
        assert "Isolation Donor A" not in names
        # Dashboard totals for B must be 0
        db_b = requests.get(f"{BASE_URL}/api/dashboard", headers=_hdr(user_b["token"]))
        assert db_b.status_code == 200
        assert db_b.json()["total_donations"] == 0
        # A can see own donation
        la = requests.get(f"{BASE_URL}/api/donations", headers=_hdr(user_a["token"]))
        names_a = [x["donor_name"] for x in la.json()]
        assert "Isolation Donor A" in names_a
        # cleanup
        for coll in ("donations", "expenses", "tasks", "events", "announcements",
                     "gallery", "polls", "rsvps"):
            db[coll].delete_many({"committee_id": {"$in": [ca_id, cb_id]}})
        db.committees.delete_many({"committee_id": {"$in": [ca_id, cb_id]}})

    def test_join_grants_access_to_existing_data(self, user_a, user_c, db):
        ra = requests.post(f"{BASE_URL}/api/committees", headers=_hdr(user_a["token"]),
                           json={"name": "TEST_CA2"})
        ca_id = ra.json()["committee_id"]
        code = ra.json()["code"]
        d = requests.post(f"{BASE_URL}/api/donations", headers=_hdr(user_a["token"]),
                          json={"donor_name": "Data For C", "amount": 222,
                                "mode": "upi", "send_sms": False})
        assert d.status_code == 200
        # Also create a task
        t = requests.post(f"{BASE_URL}/api/tasks", headers=_hdr(user_a["token"]),
                          json={"title": "Task For C", "priority": "high"})
        assert t.status_code == 200
        # C joins CA and can now see donations & tasks
        j = requests.post(f"{BASE_URL}/api/committees/join",
                          headers=_hdr(user_c["token"]), json={"code": code})
        assert j.status_code == 200
        lc = requests.get(f"{BASE_URL}/api/donations", headers=_hdr(user_c["token"]))
        assert "Data For C" in [x["donor_name"] for x in lc.json()]
        tc = requests.get(f"{BASE_URL}/api/tasks", headers=_hdr(user_c["token"]))
        assert "Task For C" in [x["title"] for x in tc.json()]
        # cleanup
        for coll in ("donations", "tasks"):
            db[coll].delete_many({"committee_id": ca_id})
        db.committees.delete_one({"committee_id": ca_id})

    def test_seed_scoped_to_current_committee(self, user_a, user_b, db):
        ra = requests.post(f"{BASE_URL}/api/committees", headers=_hdr(user_a["token"]),
                           json={"name": "TEST_SeedCA"})
        assert ra.status_code == 200
        ca_id = ra.json()["committee_id"]
        rb = requests.post(f"{BASE_URL}/api/committees", headers=_hdr(user_b["token"]),
                           json={"name": "TEST_SeedCB"})
        cb_id = rb.json()["committee_id"]
        # snapshot B's list sizes (should be zero)
        b_donations_before = requests.get(f"{BASE_URL}/api/donations",
                                          headers=_hdr(user_b["token"])).json()
        assert b_donations_before == []
        # A seeds
        s = requests.post(f"{BASE_URL}/api/dev/seed", headers=_hdr(user_a["token"]))
        assert s.status_code == 200, s.text
        # A now has seeded donations
        a_d = requests.get(f"{BASE_URL}/api/donations", headers=_hdr(user_a["token"])).json()
        assert len(a_d) >= 3
        # B still empty
        b_d = requests.get(f"{BASE_URL}/api/donations", headers=_hdr(user_b["token"])).json()
        assert b_d == []
        b_dash = requests.get(f"{BASE_URL}/api/dashboard", headers=_hdr(user_b["token"])).json()
        assert b_dash["total_donations"] == 0
        assert b_dash["total_expenses"] == 0
        # cleanup
        for coll in ("donations", "expenses", "tasks", "events", "announcements",
                     "gallery", "polls", "rsvps"):
            db[coll].delete_many({"committee_id": {"$in": [ca_id, cb_id]}})
        db.committees.delete_many({"committee_id": {"$in": [ca_id, cb_id]}})
