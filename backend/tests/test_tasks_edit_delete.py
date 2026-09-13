"""Tests for edit/remove tasks (PATCH/DELETE /api/tasks/{id}).

Permission rules under test (server.py:461-504):
- PATCH: status-only body is allowed by any committee member (checkbox / cycle);
        editing title/description/priority/etc. requires officer (President/VP/Secretary),
        author (created_by / created_by_name), or assignee.
- DELETE: officer or author only.
- 404 for missing id and for cross-committee id.
- 400 when PATCH body has no valid fields.
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


def _make_user(mongo_db, role, committee_id, name_prefix="U"):
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = f"TEST_tsk_{uuid.uuid4().hex[:6]}@example.com"
    token = f"TEST_tok_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    name = f"TEST_{name_prefix}_{uuid.uuid4().hex[:4]}"
    mongo_db.users.insert_one({
        "user_id": user_id, "email": email, "name": name,
        "role": role, "committee_id": committee_id, "created_at": now,
    })
    mongo_db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "expires_at": now + timedelta(days=1), "created_at": now,
    })
    return {"user_id": user_id, "email": email, "token": token,
            "role": role, "name": name, "committee_id": committee_id}


@pytest.fixture(scope="module")
def committee_task_a(mongo_db):
    cid = f"com_{uuid.uuid4().hex[:12]}"
    mongo_db.committees.insert_one({
        "committee_id": cid, "name": "TEST TSK A",
        "code": f"TSKA{uuid.uuid4().hex[:2].upper()}",
        "created_by": None, "created_at": datetime.now(timezone.utc),
    })
    yield cid
    # cleanup
    uids = [u["user_id"] for u in mongo_db.users.find({"committee_id": cid}, {"user_id": 1})]
    mongo_db.user_sessions.delete_many({"user_id": {"$in": uids}})
    for coll in ("users", "tasks", "notifications"):
        mongo_db[coll].delete_many({"committee_id": cid})
    mongo_db.committees.delete_one({"committee_id": cid})


@pytest.fixture(scope="module")
def committee_task_b(mongo_db):
    cid = f"com_{uuid.uuid4().hex[:12]}"
    mongo_db.committees.insert_one({
        "committee_id": cid, "name": "TEST TSK B",
        "code": f"TSKB{uuid.uuid4().hex[:2].upper()}",
        "created_by": None, "created_at": datetime.now(timezone.utc),
    })
    yield cid
    uids = [u["user_id"] for u in mongo_db.users.find({"committee_id": cid}, {"user_id": 1})]
    mongo_db.user_sessions.delete_many({"user_id": {"$in": uids}})
    for coll in ("users", "tasks", "notifications"):
        mongo_db[coll].delete_many({"committee_id": cid})
    mongo_db.committees.delete_one({"committee_id": cid})


@pytest.fixture(scope="module")
def usersT(mongo_db, committee_task_a):
    return {
        "president": _make_user(mongo_db, "President", committee_task_a, "pres"),
        "vp": _make_user(mongo_db, "Vice President", committee_task_a, "vp"),
        "secretary": _make_user(mongo_db, "Secretary", committee_task_a, "sec"),
        "author": _make_user(mongo_db, "Regular Member", committee_task_a, "auth"),
        "assignee": _make_user(mongo_db, "Volunteer", committee_task_a, "assn"),
        "other": _make_user(mongo_db, "Regular Member", committee_task_a, "othr"),
    }


@pytest.fixture(scope="module")
def userB(mongo_db, committee_task_b):
    return _make_user(mongo_db, "President", committee_task_b, "presB")


def _create_task(tok, title="Test Task", assignee_id=None, assignee_name=None,
                 description="desc", priority="medium"):
    payload = {"title": title, "description": description, "priority": priority}
    if assignee_id:
        payload["assignee_id"] = assignee_id
        payload["assignee_name"] = assignee_name
    r = requests.post(f"{BASE_URL}/api/tasks", headers=_hdr(tok), json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- PATCH: content edits (title/desc/priority) ----------------
class TestTaskPatchContent:
    def test_author_can_edit_content(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["author"]["token"]),
                           json={"title": "New Title", "description": "New Desc",
                                 "priority": "high"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "New Title"
        assert body["description"] == "New Desc"
        assert body["priority"] == "high"
        # GET verify persistence via list
        gr = requests.get(f"{BASE_URL}/api/tasks", headers=_hdr(usersT["author"]["token"]))
        assert gr.status_code == 200
        found = [x for x in gr.json() if x["task_id"] == t["task_id"]]
        assert len(found) == 1
        assert found[0]["title"] == "New Title"
        assert found[0]["priority"] == "high"

    def test_assignee_can_edit_content(self, usersT):
        t = _create_task(usersT["author"]["token"],
                         assignee_id=usersT["assignee"]["user_id"],
                         assignee_name=usersT["assignee"]["name"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["assignee"]["token"]),
                           json={"title": "Assignee Edit", "priority": "critical"})
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "Assignee Edit"
        assert r.json()["priority"] == "critical"

    def test_president_can_edit_content(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["president"]["token"]),
                           json={"title": "Pres Edit"})
        assert r.status_code == 200
        assert r.json()["title"] == "Pres Edit"

    def test_vp_can_edit_content(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["vp"]["token"]),
                           json={"description": "VP updated"})
        assert r.status_code == 200
        assert r.json()["description"] == "VP updated"

    def test_secretary_can_edit_content(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["secretary"]["token"]),
                           json={"priority": "low"})
        assert r.status_code == 200
        assert r.json()["priority"] == "low"

    def test_other_member_forbidden_on_content_edit(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["other"]["token"]),
                           json={"title": "hijack"})
        assert r.status_code == 403

    def test_other_member_forbidden_on_priority(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["other"]["token"]),
                           json={"priority": "critical"})
        assert r.status_code == 403


# ---------------- PATCH: status-only toggles allowed by anyone ----------------
class TestTaskStatusOnly:
    def test_other_member_can_toggle_status(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["other"]["token"]),
                           json={"status": "done"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "done"

    def test_other_member_can_cycle_status(self, usersT):
        t = _create_task(usersT["author"]["token"])
        # todo -> doing
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["other"]["token"]),
                           json={"status": "doing"})
        assert r.status_code == 200
        assert r.json()["status"] == "doing"
        # doing -> done
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["other"]["token"]),
                           json={"status": "done"})
        assert r.status_code == 200
        assert r.json()["status"] == "done"

    def test_status_plus_title_by_other_forbidden(self, usersT):
        """If body has status AND another field, it's no longer status-only -> 403 for non-manager."""
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["other"]["token"]),
                           json={"status": "doing", "title": "sneaky"})
        assert r.status_code == 403


# ---------------- PATCH: 404 / 400 / cross-committee ----------------
class TestTaskPatchNegatives:
    def test_patch_missing_id_returns_404(self, usersT):
        r = requests.patch(f"{BASE_URL}/api/tasks/task_doesnotexist",
                           headers=_hdr(usersT["president"]["token"]),
                           json={"title": "x"})
        assert r.status_code == 404

    def test_patch_no_valid_fields_returns_400(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["author"]["token"]),
                           json={"foo": "bar"})  # unknown field is stripped -> empty
        assert r.status_code == 400

    def test_patch_empty_body_returns_400(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(usersT["author"]["token"]),
                           json={})
        assert r.status_code == 400

    def test_patch_cross_committee_returns_404(self, usersT, userB):
        # Task created in committee A
        t = _create_task(usersT["author"]["token"])
        # User in committee B tries to patch it -> should be 404 (cscope filter)
        r = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                           headers=_hdr(userB["token"]),
                           json={"title": "hijack"})
        assert r.status_code == 404


# ---------------- DELETE ----------------
class TestTaskDelete:
    def test_author_can_delete(self, mongo_db, usersT, committee_task_a):
        t = _create_task(usersT["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(usersT["author"]["token"]))
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # verify gone via GET-by-list
        gr = requests.get(f"{BASE_URL}/api/tasks", headers=_hdr(usersT["author"]["token"]))
        assert not any(x["task_id"] == t["task_id"] for x in gr.json())
        # verify gone via next PATCH 404
        r2 = requests.patch(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(usersT["president"]["token"]),
                            json={"title": "x"})
        assert r2.status_code == 404

    def test_president_can_delete_someone_elses(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(usersT["president"]["token"]))
        assert r.status_code == 200

    def test_vp_can_delete(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(usersT["vp"]["token"]))
        assert r.status_code == 200

    def test_secretary_can_delete(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(usersT["secretary"]["token"]))
        assert r.status_code == 200

    def test_assignee_cannot_delete(self, usersT):
        """Assignee can edit but NOT delete."""
        t = _create_task(usersT["author"]["token"],
                         assignee_id=usersT["assignee"]["user_id"],
                         assignee_name=usersT["assignee"]["name"])
        r = requests.delete(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(usersT["assignee"]["token"]))
        assert r.status_code == 403

    def test_other_member_cannot_delete(self, usersT):
        t = _create_task(usersT["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(usersT["other"]["token"]))
        assert r.status_code == 403

    def test_delete_missing_returns_404(self, usersT):
        r = requests.delete(f"{BASE_URL}/api/tasks/task_missing_xxx",
                            headers=_hdr(usersT["president"]["token"]))
        assert r.status_code == 404

    def test_delete_cross_committee_returns_404(self, usersT, userB):
        t = _create_task(usersT["author"]["token"])
        r = requests.delete(f"{BASE_URL}/api/tasks/{t['task_id']}",
                            headers=_hdr(userB["token"]))
        assert r.status_code == 404
        # And confirm task still exists in A
        gr = requests.get(f"{BASE_URL}/api/tasks", headers=_hdr(usersT["author"]["token"]))
        assert any(x["task_id"] == t["task_id"] for x in gr.json())


# ---------------- Create still works (regression) ----------------
class TestTaskCreateRegression:
    def test_create_task_basic(self, usersT):
        r = requests.post(f"{BASE_URL}/api/tasks",
                          headers=_hdr(usersT["author"]["token"]),
                          json={"title": "New Reg Task", "description": "reg",
                                "priority": "medium"})
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "New Reg Task"
        assert body["status"] == "todo"
        assert "task_id" in body
        assert body["created_by"] == usersT["author"]["user_id"]
