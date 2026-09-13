"""Vinayaka Seva backend API tests."""
import json
import time

import pytest


# ---------- Health & basics ----------
class TestHealth:
    def test_root(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("app") == "Vinayaka Seva"

    def test_roles(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/roles")
        assert r.status_code == 200
        roles = r.json().get("roles")
        assert isinstance(roles, list)
        assert len(roles) == 15
        assert "President" in roles and "Regular Member" in roles

    def test_festival_config(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/config/festival")
        assert r.status_code == 200
        data = r.json()
        assert "festival_start" in data
        assert isinstance(data["festival_start"], str)


# ---------- Auth ----------
class TestAuth:
    def test_invalid_session_id(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/session",
                            json={"session_id": "definitely-invalid"})
        assert r.status_code == 401

    def test_me_without_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/auth/me",
                           headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401

    def test_me_with_valid_token(self, api_client, base_url, president_headers, president):
        r = api_client.get(f"{base_url}/api/auth/me", headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["user_id"] == president["user_id"]
        assert data["role"] == "President"


# ---------- Seed + Dashboard ----------
class TestSeedAndDashboard:
    def test_seed_forbidden_for_regular(self, api_client, base_url, member_headers):
        r = api_client.post(f"{base_url}/api/dev/seed", headers=member_headers)
        assert r.status_code == 403

    def test_seed_as_president(self, api_client, base_url, president_headers):
        r = api_client.post(f"{base_url}/api/dev/seed", headers=president_headers)
        assert r.status_code == 200
        body = r.json()
        assert body.get("seeded") is True

    def test_dashboard_totals_after_seed(self, api_client, base_url, president_headers):
        r = api_client.get(f"{base_url}/api/dashboard", headers=president_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["total_donations"] > 0
        assert d["total_expenses"] > 0
        assert d["balance"] == d["total_donations"] - d["total_expenses"]
        assert d["pending_tasks_count"] >= 1
        assert "festival_start" in d


# ---------- Tasks CRUD ----------
class TestTasks:
    task_id = None

    def test_list_tasks(self, api_client, base_url, president_headers):
        r = api_client.get(f"{base_url}/api/tasks", headers=president_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_task(self, api_client, base_url, president_headers):
        payload = {"title": "TEST_Task_A", "description": "unit test", "priority": "high"}
        r = api_client.post(f"{base_url}/api/tasks", json=payload, headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "TEST_Task_A"
        assert data["priority"] == "high"
        assert data.get("task_id", "").startswith("task_")
        TestTasks.task_id = data["task_id"]

        # Verify via GET list
        r2 = api_client.get(f"{base_url}/api/tasks", headers=president_headers)
        ids = [t["task_id"] for t in r2.json()]
        assert TestTasks.task_id in ids

    def test_patch_task(self, api_client, base_url, president_headers):
        assert TestTasks.task_id
        r = api_client.patch(f"{base_url}/api/tasks/{TestTasks.task_id}",
                             json={"status": "doing"}, headers=president_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "doing"

    def test_add_comment(self, api_client, base_url, president_headers):
        assert TestTasks.task_id
        r = api_client.post(f"{base_url}/api/tasks/{TestTasks.task_id}/comments",
                            json={"text": "TEST comment"}, headers=president_headers)
        assert r.status_code == 200
        assert r.json()["text"] == "TEST comment"

    def test_delete_task(self, api_client, base_url, president_headers):
        assert TestTasks.task_id
        r = api_client.delete(f"{base_url}/api/tasks/{TestTasks.task_id}",
                              headers=president_headers)
        assert r.status_code == 200
        # Verify deletion
        r2 = api_client.get(f"{base_url}/api/tasks", headers=president_headers)
        ids = [t["task_id"] for t in r2.json()]
        assert TestTasks.task_id not in ids


# ---------- Donations ----------
class TestDonations:
    def test_list_donations(self, api_client, base_url, president_headers):
        r = api_client.get(f"{base_url}/api/donations", headers=president_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_donation(self, api_client, base_url, president_headers):
        payload = {"donor_name": "TEST_Donor", "amount": 501.0, "mode": "upi"}
        r = api_client.post(f"{base_url}/api/donations", json=payload, headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["donor_name"] == "TEST_Donor"
        assert data["amount"] == 501.0
        assert data["donation_id"].startswith("don_")


# ---------- Expenses ----------
class TestExpenses:
    expense_id = None

    def test_create_expense(self, api_client, base_url, president_headers):
        payload = {"amount": 250.0, "category": "food", "vendor": "TEST_V",
                   "description": "test"}
        r = api_client.post(f"{base_url}/api/expenses", json=payload, headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["amount"] == 250.0
        assert data["approved"] is False
        TestExpenses.expense_id = data["expense_id"]

    def test_approve_forbidden_for_regular(self, api_client, base_url, member_headers):
        assert TestExpenses.expense_id
        r = api_client.patch(
            f"{base_url}/api/expenses/{TestExpenses.expense_id}/approve",
            headers=member_headers)
        assert r.status_code == 403

    def test_approve_as_president(self, api_client, base_url, president_headers):
        assert TestExpenses.expense_id
        r = api_client.patch(
            f"{base_url}/api/expenses/{TestExpenses.expense_id}/approve",
            headers=president_headers)
        assert r.status_code == 200
        # Verify persistence
        r2 = api_client.get(f"{base_url}/api/expenses", headers=president_headers)
        match = [e for e in r2.json() if e["expense_id"] == TestExpenses.expense_id]
        assert len(match) == 1
        assert match[0]["approved"] is True


# ---------- Announcements ----------
class TestAnnouncements:
    def test_create_and_list(self, api_client, base_url, president_headers):
        r = api_client.post(f"{base_url}/api/announcements",
                            json={"title": "TEST_Ann", "body": "hi", "pinned": True},
                            headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "TEST_Ann"
        assert data["pinned"] is True

        r2 = api_client.get(f"{base_url}/api/announcements", headers=president_headers)
        assert r2.status_code == 200
        titles = [a["title"] for a in r2.json()]
        assert "TEST_Ann" in titles


# ---------- Events ----------
class TestEvents:
    def test_create_and_list(self, api_client, base_url, president_headers):
        payload = {"title": "TEST_Evt", "starts_at": "2026-08-27T06:00:00Z",
                   "location": "Pandal", "category": "pooja"}
        r = api_client.post(f"{base_url}/api/events", json=payload, headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["title"] == "TEST_Evt"
        assert data["event_id"].startswith("evt_")

        r2 = api_client.get(f"{base_url}/api/events", headers=president_headers)
        titles = [e["title"] for e in r2.json()]
        assert "TEST_Evt" in titles


# ---------- Members & RBAC ----------
class TestMembers:
    def test_list_members(self, api_client, base_url, president_headers):
        r = api_client.get(f"{base_url}/api/members", headers=president_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 2

    def test_role_update_forbidden_for_regular(self, api_client, base_url, member_headers,
                                               regular_member):
        r = api_client.patch(
            f"{base_url}/api/members/{regular_member['user_id']}/role",
            json={"role": "Treasurer"}, headers=member_headers)
        assert r.status_code == 403

    def test_role_update_as_president(self, api_client, base_url, president_headers,
                                      regular_member, mongo_db):
        r = api_client.patch(
            f"{base_url}/api/members/{regular_member['user_id']}/role",
            json={"role": "Treasurer"}, headers=president_headers)
        assert r.status_code == 200
        # Verify in DB
        doc = mongo_db.users.find_one({"user_id": regular_member["user_id"]})
        assert doc["role"] == "Treasurer"
        # Reset back for other tests
        mongo_db.users.update_one({"user_id": regular_member["user_id"]},
                                  {"$set": {"role": "Regular Member"}})

    def test_role_update_invalid_role(self, api_client, base_url, president_headers,
                                      regular_member):
        r = api_client.patch(
            f"{base_url}/api/members/{regular_member['user_id']}/role",
            json={"role": "Overlord"}, headers=president_headers)
        assert r.status_code == 400


# ---------- AI streaming ----------
class TestAI:
    def test_ai_chat_stream(self, api_client, base_url, president_headers):
        url = f"{base_url}/api/ai/chat"
        payload = {"question": "How much did we spend on food?"}
        deltas = []
        done_seen = False
        error_seen = None
        with api_client.post(url, json=payload, headers=president_headers,
                              stream=True, timeout=90) as r:
            assert r.status_code == 200, f"AI chat returned {r.status_code}: {r.text[:300]}"
            for raw in r.iter_lines(decode_unicode=True):
                if not raw:
                    continue
                if raw.startswith("data: "):
                    try:
                        obj = json.loads(raw[6:])
                    except Exception:
                        continue
                    if "delta" in obj:
                        deltas.append(obj["delta"])
                    if "error" in obj:
                        error_seen = obj["error"]
                    if obj.get("done"):
                        done_seen = True
                        break
        assert done_seen, f"No done event. deltas={len(deltas)}, error={error_seen}"
        # deltas may be empty if provider returned empty, but usually should have some
        assert error_seen is None, f"AI stream error: {error_seen}"

    def test_ai_history(self, api_client, base_url, president_headers):
        # small delay to let assistant write complete
        time.sleep(1)
        r = api_client.get(f"{base_url}/api/ai/history", headers=president_headers)
        assert r.status_code == 200
        msgs = r.json()
        assert isinstance(msgs, list)
        assert len(msgs) >= 2
        roles = {m["role"] for m in msgs}
        assert "user" in roles
        assert "assistant" in roles
