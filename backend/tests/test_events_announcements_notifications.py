"""Tests for edit/remove events + announcements, and in-app notifications.

Covers:
- PATCH/DELETE /api/events/{id} permission rules (author OR President/VP/Secretary),
  cascade delete of RSVPs, 404 on missing id, 400 on empty body.
- PATCH/DELETE /api/announcements/{id} permission rules.
- Notifications emitted on create donation/expense/event/announcement.
- GET /api/notifications, GET /api/notifications/unread-count,
  POST /api/notifications/mark-read (all=true) - per-user unread tracking.
- Committee isolation of notifications.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

_BE = Path(__file__).resolve().parents[1] / ".env"
_FE = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(_BE)
load_dotenv(_FE, override=False)

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
            or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")


# ---------------- helpers ----------------
def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _make_user(mongo_db, role, committee_id):
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = f"TEST_ntf_{uuid.uuid4().hex[:6]}@example.com"
    token = f"TEST_tok_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    mongo_db.users.insert_one({
        "user_id": user_id, "email": email, "name": f"User {uuid.uuid4().hex[:4]}",
        "role": role, "committee_id": committee_id, "created_at": now,
    })
    mongo_db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "expires_at": now + timedelta(days=1), "created_at": now,
    })
    return mongo_db.users.find_one({"user_id": user_id}, {"_id": 0}) | {"token": token}


@pytest.fixture(scope="module")
def committee_a(mongo_db):
    cid = f"com_{uuid.uuid4().hex[:12]}"
    mongo_db.committees.insert_one({
        "committee_id": cid, "name": "TEST NTF A", "code": f"NTFA{uuid.uuid4().hex[:2].upper()}",
        "created_by": None, "created_at": datetime.now(timezone.utc),
    })
    yield cid
    # cleanup
    for coll in ("users", "user_sessions", "notifications", "donations", "expenses",
                 "events", "announcements", "rsvps", "committees"):
        try:
            if coll == "committees":
                mongo_db[coll].delete_one({"committee_id": cid})
            elif coll == "user_sessions":
                # Delete sessions of users in this committee
                uids = [u["user_id"] for u in mongo_db.users.find({"committee_id": cid}, {"user_id": 1})]
                mongo_db.user_sessions.delete_many({"user_id": {"$in": uids}})
            else:
                mongo_db[coll].delete_many({"committee_id": cid})
        except Exception:
            pass


@pytest.fixture(scope="module")
def committee_b(mongo_db):
    cid = f"com_{uuid.uuid4().hex[:12]}"
    mongo_db.committees.insert_one({
        "committee_id": cid, "name": "TEST NTF B", "code": f"NTFB{uuid.uuid4().hex[:2].upper()}",
        "created_by": None, "created_at": datetime.now(timezone.utc),
    })
    yield cid
    for coll in ("users", "notifications", "donations", "expenses",
                 "events", "announcements", "rsvps", "committees"):
        try:
            if coll == "committees":
                mongo_db[coll].delete_one({"committee_id": cid})
            else:
                mongo_db[coll].delete_many({"committee_id": cid})
        except Exception:
            pass


@pytest.fixture(scope="module")
def usersA(mongo_db, committee_a):
    return {
        "president": _make_user(mongo_db, "President", committee_a),
        "author": _make_user(mongo_db, "Regular Member", committee_a),
        "other": _make_user(mongo_db, "Regular Member", committee_a),
    }


@pytest.fixture(scope="module")
def userB(mongo_db, committee_b):
    return _make_user(mongo_db, "President", committee_b)


# ---------------- Events edit/delete ----------------
class TestEventsEditDelete:
    def _create_event(self, tok, title="Test Evt"):
        r = requests.post(f"{BASE_URL}/api/events", headers=_hdr(tok),
                          json={"title": title, "starts_at": "2026-09-01T10:00:00Z",
                                "location": "Pandal", "category": "pooja"})
        assert r.status_code == 200, r.text
        return r.json()["event_id"]

    def test_author_can_patch(self, usersA):
        eid = self._create_event(usersA["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/events/{eid}",
                           headers=_hdr(usersA["author"]["token"]),
                           json={"title": "Updated by author"})
        assert r.status_code == 200
        assert r.json()["title"] == "Updated by author"

    def test_other_member_cannot_patch(self, usersA):
        eid = self._create_event(usersA["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/events/{eid}",
                           headers=_hdr(usersA["other"]["token"]),
                           json={"title": "hijack"})
        assert r.status_code == 403

    def test_president_can_patch(self, usersA):
        eid = self._create_event(usersA["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/events/{eid}",
                           headers=_hdr(usersA["president"]["token"]),
                           json={"title": "Pres edit"})
        assert r.status_code == 200
        assert r.json()["title"] == "Pres edit"

    def test_patch_missing_id_returns_404(self, usersA):
        r = requests.patch(f"{BASE_URL}/api/events/evt_doesnotexist",
                           headers=_hdr(usersA["president"]["token"]),
                           json={"title": "x"})
        assert r.status_code == 404

    def test_patch_empty_body_returns_400(self, usersA):
        eid = self._create_event(usersA["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/events/{eid}",
                           headers=_hdr(usersA["author"]["token"]),
                           json={})
        assert r.status_code == 400

    def test_delete_other_member_forbidden(self, usersA):
        eid = self._create_event(usersA["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/events/{eid}",
                            headers=_hdr(usersA["other"]["token"]))
        assert r.status_code == 403

    def test_delete_author_ok_and_cascade_rsvps(self, mongo_db, usersA):
        eid = self._create_event(usersA["author"]["token"])
        # Add RSVPs from two users
        for u in (usersA["author"], usersA["other"]):
            r = requests.post(f"{BASE_URL}/api/events/{eid}/rsvp",
                              headers=_hdr(u["token"]), json={"status": "yes", "plus_ones": 1})
            assert r.status_code == 200
        # Verify RSVPs exist in DB
        assert mongo_db.rsvps.count_documents({"event_id": eid}) == 2
        # Author deletes
        r = requests.delete(f"{BASE_URL}/api/events/{eid}",
                            headers=_hdr(usersA["author"]["token"]))
        assert r.status_code == 200
        # RSVPs should be cascaded
        assert mongo_db.rsvps.count_documents({"event_id": eid}) == 0
        # Event gone
        r2 = requests.patch(f"{BASE_URL}/api/events/{eid}",
                            headers=_hdr(usersA["president"]["token"]),
                            json={"title": "x"})
        assert r2.status_code == 404

    def test_delete_missing_returns_404(self, usersA):
        r = requests.delete(f"{BASE_URL}/api/events/evt_missing_xxx",
                            headers=_hdr(usersA["president"]["token"]))
        assert r.status_code == 404

    def test_president_can_delete_someone_elses(self, usersA):
        eid = self._create_event(usersA["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/events/{eid}",
                            headers=_hdr(usersA["president"]["token"]))
        assert r.status_code == 200


# ---------------- Announcements edit/delete ----------------
class TestAnnouncementsEditDelete:
    def _create_ann(self, tok):
        r = requests.post(f"{BASE_URL}/api/announcements", headers=_hdr(tok),
                          json={"title": "Test Ann", "body": "hello"})
        assert r.status_code == 200, r.text
        return r.json()["announcement_id"]

    def test_author_can_patch(self, usersA):
        aid = self._create_ann(usersA["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/announcements/{aid}",
                           headers=_hdr(usersA["author"]["token"]),
                           json={"body": "edited"})
        assert r.status_code == 200
        assert r.json()["body"] == "edited"

    def test_other_member_cannot_patch(self, usersA):
        aid = self._create_ann(usersA["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/announcements/{aid}",
                           headers=_hdr(usersA["other"]["token"]),
                           json={"body": "x"})
        assert r.status_code == 403

    def test_president_can_patch(self, usersA):
        aid = self._create_ann(usersA["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/announcements/{aid}",
                           headers=_hdr(usersA["president"]["token"]),
                           json={"pinned": True})
        assert r.status_code == 200
        assert r.json()["pinned"] is True

    def test_delete_other_member_forbidden(self, usersA):
        aid = self._create_ann(usersA["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/announcements/{aid}",
                            headers=_hdr(usersA["other"]["token"]))
        assert r.status_code == 403

    def test_author_can_delete(self, usersA):
        aid = self._create_ann(usersA["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/announcements/{aid}",
                            headers=_hdr(usersA["author"]["token"]))
        assert r.status_code == 200

    def test_president_can_delete(self, usersA):
        aid = self._create_ann(usersA["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/announcements/{aid}",
                            headers=_hdr(usersA["president"]["token"]))
        assert r.status_code == 200

    def test_patch_missing_returns_404(self, usersA):
        r = requests.patch(f"{BASE_URL}/api/announcements/ann_missing",
                           headers=_hdr(usersA["president"]["token"]),
                           json={"body": "x"})
        assert r.status_code == 404


# ---------------- Notifications ----------------
class TestNotifications:
    def test_donation_emits_notification(self, mongo_db, usersA, committee_a):
        before = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "donation"})
        r = requests.post(f"{BASE_URL}/api/donations", headers=_hdr(usersA["president"]["token"]),
                          json={"donor_name": "TESTDonor", "amount": 500, "mode": "cash", "send_sms": False})
        assert r.status_code == 200
        after = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "donation"})
        assert after == before + 1

    def test_expense_emits_notification(self, mongo_db, usersA, committee_a):
        before = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "expense"})
        r = requests.post(f"{BASE_URL}/api/expenses", headers=_hdr(usersA["president"]["token"]),
                          json={"amount": 200, "category": "misc", "vendor": "T", "description": "d"})
        assert r.status_code == 200
        after = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "expense"})
        assert after == before + 1

    def test_event_emits_notification(self, mongo_db, usersA, committee_a):
        before = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "event"})
        r = requests.post(f"{BASE_URL}/api/events", headers=_hdr(usersA["president"]["token"]),
                          json={"title": "NtfEvt", "starts_at": "2026-09-02T10:00:00Z",
                                "location": "x", "category": "pooja"})
        assert r.status_code == 200
        after = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "event"})
        assert after == before + 1

    def test_announcement_emits_notification(self, mongo_db, usersA, committee_a):
        before = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "announcement"})
        r = requests.post(f"{BASE_URL}/api/announcements", headers=_hdr(usersA["president"]["token"]),
                          json={"title": "NtfAnn", "body": "b"})
        assert r.status_code == 200
        after = mongo_db.notifications.count_documents({"committee_id": committee_a, "kind": "announcement"})
        assert after == before + 1

    def test_list_notifications_shape(self, usersA):
        r = requests.get(f"{BASE_URL}/api/notifications", headers=_hdr(usersA["other"]["token"]))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "unread" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["unread"], int)
        assert data["unread"] >= 1  # at least one from earlier
        # newest-first check
        ts = [i["created_at"] for i in data["items"]]
        assert ts == sorted(ts, reverse=True)
        # required fields per item
        for i in data["items"]:
            for k in ("kind", "title", "body", "tint", "by_name", "created_at", "is_read"):
                assert k in i, f"missing {k}"
            assert i["is_read"] is False  # 'other' user hasn't read anything

    def test_unread_count_matches_list(self, usersA):
        r1 = requests.get(f"{BASE_URL}/api/notifications", headers=_hdr(usersA["other"]["token"]))
        r2 = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=_hdr(usersA["other"]["token"]))
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["unread"] == r2.json()["unread"]

    def test_mark_read_all_scoped_per_user(self, usersA):
        # 'other' marks all read -> unread=0 for other, but 'author' still has their own count
        r = requests.post(f"{BASE_URL}/api/notifications/mark-read",
                          headers=_hdr(usersA["other"]["token"]), json={"all": True})
        assert r.status_code == 200

        r_other = requests.get(f"{BASE_URL}/api/notifications/unread-count",
                               headers=_hdr(usersA["other"]["token"]))
        assert r_other.json()["unread"] == 0

        r_author = requests.get(f"{BASE_URL}/api/notifications/unread-count",
                                headers=_hdr(usersA["author"]["token"]))
        # author has NOT marked read -> should still have >0 unread
        assert r_author.json()["unread"] >= 1

        # List for 'other' should show is_read True on all items
        rl = requests.get(f"{BASE_URL}/api/notifications", headers=_hdr(usersA["other"]["token"]))
        for i in rl.json()["items"]:
            assert i["is_read"] is True

    def test_committee_isolation(self, usersA, userB):
        # Create a fresh donation in committee A
        r = requests.post(f"{BASE_URL}/api/donations", headers=_hdr(usersA["president"]["token"]),
                          json={"donor_name": "Isolate", "amount": 100, "mode": "cash", "send_sms": False})
        assert r.status_code == 200
        # User in committee B should NOT see any of A's notifications
        r2 = requests.get(f"{BASE_URL}/api/notifications", headers=_hdr(userB["token"]))
        assert r2.status_code == 200
        titles = [i["title"] for i in r2.json()["items"]]
        assert not any("Isolate" in t for t in titles)
