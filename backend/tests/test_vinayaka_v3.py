"""Vinayaka Seva v3 backend tests: SMS config, SMS-on-donation, Event RSVPs."""
import time

import pytest


# ---------- SMS Config ----------
class TestSmsConfig:
    def test_get_forbidden_for_regular(self, api_client, base_url, member_headers):
        r = api_client.get(f"{base_url}/api/config/sms", headers=member_headers)
        assert r.status_code == 403

    def test_get_as_president_defaults(self, api_client, base_url, president_headers, mongo_db):
        # Ensure a clean slate for the SMS config
        mongo_db.config.delete_many({"key": "sms"})
        r = api_client.get(f"{base_url}/api/config/sms", headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        # No sensitive fields ever exposed
        assert "twilio_token" not in data
        assert "msg91_authkey" not in data
        # It's OK for booleans to be absent when no config exists yet
        assert data.get("twilio_token_set", False) is False
        assert data.get("msg91_authkey_set", False) is False

    def test_put_as_president_full_body(self, api_client, base_url, president_headers, mongo_db):
        payload = {
            "enabled": True,
            "provider": "twilio",
            "committee_name": "Hanuman youth",
            "template": "Thanks {donor} for ₹{amount} to {committee}",
            "twilio_sid": "ACtestsid123",
            "twilio_token": "SUPER_SECRET_TOKEN_1",
            "twilio_from": "+15005550006",
            "msg91_authkey": "MSG91KEY_1",
            "msg91_sender": "TXTLCL",
        }
        r = api_client.put(f"{base_url}/api/config/sms", json=payload,
                           headers=president_headers)
        assert r.status_code == 200
        # Direct DB check that token got persisted
        cfg = mongo_db.config.find_one({"key": "sms"})
        assert cfg["twilio_token"] == "SUPER_SECRET_TOKEN_1"
        assert cfg["msg91_authkey"] == "MSG91KEY_1"
        assert cfg["committee_name"] == "Hanuman youth"

    def test_get_hides_secrets_shows_flags(self, api_client, base_url, president_headers):
        r = api_client.get(f"{base_url}/api/config/sms", headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert "twilio_token" not in data
        assert "msg91_authkey" not in data
        assert data.get("twilio_token_set") is True
        assert data.get("msg91_authkey_set") is True
        # Non-sensitive fields are visible
        assert data.get("twilio_sid") == "ACtestsid123"
        assert data.get("twilio_from") == "+15005550006"
        assert data.get("committee_name") == "Hanuman youth"

    def test_put_blank_token_preserves_previous(self, api_client, base_url,
                                                president_headers, mongo_db):
        # Second PUT leaves sensitive fields blank -> must preserve old values
        payload = {
            "enabled": True,
            "provider": "twilio",
            "committee_name": "Hanuman youth",
            "template": "Thanks {donor} for ₹{amount} to {committee}",
            "twilio_sid": "",       # blank
            "twilio_token": "",     # blank
            "twilio_from": "",      # blank
            "msg91_authkey": "",    # blank
            "msg91_sender": "",     # blank
        }
        r = api_client.put(f"{base_url}/api/config/sms", json=payload,
                           headers=president_headers)
        assert r.status_code == 200
        cfg = mongo_db.config.find_one({"key": "sms"})
        # Old sensitive values must be preserved
        assert cfg["twilio_token"] == "SUPER_SECRET_TOKEN_1"
        assert cfg["msg91_authkey"] == "MSG91KEY_1"
        assert cfg["twilio_sid"] == "ACtestsid123"
        assert cfg["twilio_from"] == "+15005550006"

    def test_put_forbidden_for_regular(self, api_client, base_url, member_headers):
        payload = {"enabled": True, "provider": "twilio",
                   "committee_name": "Hanuman youth", "template": "x"}
        r = api_client.put(f"{base_url}/api/config/sms", json=payload,
                           headers=member_headers)
        assert r.status_code == 403

    def test_sms_test_endpoint_no_creds_skipped(self, api_client, base_url,
                                                president_headers, mongo_db):
        # Wipe config so twilio is unconfigured
        mongo_db.config.delete_many({"key": "sms"})
        # Enable but leave twilio creds blank
        mongo_db.config.insert_one({
            "key": "sms", "enabled": True, "provider": "twilio",
            "committee_name": "Hanuman youth",
            "template": "Thanks {donor} for ₹{amount}",
        })
        phone = "+911234500001"
        r = api_client.post(f"{base_url}/api/config/sms/test",
                            json={"phone": phone}, headers=president_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "skipped"
        assert "twilio" in (data.get("reason") or "").lower()
        # cleanup
        mongo_db.sms_logs.delete_many({"donation_id": "test", "phone": phone})

    def test_sms_test_endpoint_forbidden_for_regular(self, api_client, base_url, member_headers):
        r = api_client.post(f"{base_url}/api/config/sms/test",
                            json={"phone": "+911234500002"}, headers=member_headers)
        assert r.status_code == 403


# ---------- Donations SMS side-effect ----------
def _wait_for_sms_log(mongo_db, donation_id: str, timeout_s: float = 5.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        doc = mongo_db.sms_logs.find_one({"donation_id": donation_id})
        if doc:
            return doc
        time.sleep(0.2)
    return None


class TestDonationSms:
    def test_donation_with_phone_and_send_sms_true_logs_skipped(
            self, api_client, base_url, president_headers, mongo_db):
        # Ensure sms enabled but no twilio creds (already set above; assert)
        mongo_db.config.update_one(
            {"key": "sms"},
            {"$set": {"enabled": True, "provider": "twilio",
                      "committee_name": "Hanuman youth",
                      "template": "Thanks {donor} for ₹{amount}"},
             "$unset": {"twilio_sid": "", "twilio_token": "", "twilio_from": ""}},
            upsert=True,
        )
        payload = {"donor_name": "TEST_SmsDonor", "amount": 251.0, "mode": "upi",
                   "phone": "+911234567890", "send_sms": True}
        r = api_client.post(f"{base_url}/api/donations", json=payload,
                            headers=president_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["donation_id"].startswith("don_")
        did = d["donation_id"]
        # Poll for the sms log for up to 5 seconds
        log = _wait_for_sms_log(mongo_db, did, 5.0)
        assert log is not None, "No sms_logs entry created for donation with send_sms=True"
        assert log.get("phone") == "+911234567890"
        assert log.get("status") == "skipped"
        assert "twilio" in (log.get("reason") or "").lower()

    def test_donation_with_send_sms_false_no_log(
            self, api_client, base_url, president_headers, mongo_db):
        payload = {"donor_name": "TEST_NoSms", "amount": 111.0, "mode": "cash",
                   "phone": "+911234567891", "send_sms": False}
        r = api_client.post(f"{base_url}/api/donations", json=payload,
                            headers=president_headers)
        assert r.status_code == 200
        did = r.json()["donation_id"]
        # Wait briefly then assert no log
        time.sleep(1.0)
        log = mongo_db.sms_logs.find_one({"donation_id": did})
        assert log is None, f"Unexpected sms_logs entry when send_sms=False: {log}"

    def test_donation_without_phone_no_log(
            self, api_client, base_url, president_headers, mongo_db):
        payload = {"donor_name": "TEST_NoPhone", "amount": 55.0, "mode": "cash"}
        r = api_client.post(f"{base_url}/api/donations", json=payload,
                            headers=president_headers)
        assert r.status_code == 200
        did = r.json()["donation_id"]
        time.sleep(1.0)
        log = mongo_db.sms_logs.find_one({"donation_id": did})
        assert log is None, f"Unexpected sms_logs entry when phone missing: {log}"


# ---------- Event RSVP (Prasadam Roster) ----------
class TestEventRsvp:
    event_id = None

    def test_create_event_for_rsvp(self, api_client, base_url, president_headers, mongo_db):
        # Clean baseline for rsvp summary counts on this event
        mongo_db.rsvps.delete_many({})
        payload = {"title": "TEST_RSVP_Event", "starts_at": "2026-09-01T12:00:00Z",
                   "location": "Pandal", "category": "prasadam"}
        r = api_client.post(f"{base_url}/api/events", json=payload,
                            headers=president_headers)
        assert r.status_code == 200
        TestEventRsvp.event_id = r.json()["event_id"]
        assert TestEventRsvp.event_id.startswith("evt_")

    def test_bad_status_returns_400(self, api_client, base_url, member_headers):
        assert TestEventRsvp.event_id
        r = api_client.post(
            f"{base_url}/api/events/{TestEventRsvp.event_id}/rsvp",
            json={"status": "definitely_bad", "plus_ones": 0},
            headers=member_headers,
        )
        assert r.status_code == 400

    def test_user1_rsvps_yes_plus2(self, api_client, base_url, member_headers, regular_member):
        assert TestEventRsvp.event_id
        r = api_client.post(
            f"{base_url}/api/events/{TestEventRsvp.event_id}/rsvp",
            json={"status": "yes", "plus_ones": 2}, headers=member_headers,
        )
        assert r.status_code == 200
        # list rsvps
        r2 = api_client.get(
            f"{base_url}/api/events/{TestEventRsvp.event_id}/rsvps",
            headers=member_headers,
        )
        assert r2.status_code == 200
        items = r2.json()
        assert len(items) == 1
        assert items[0]["user_id"] == regular_member["user_id"]
        assert items[0]["status"] == "yes"
        assert items[0]["plus_ones"] == 2

    def test_summary_after_first_rsvp(self, api_client, base_url, president_headers):
        r = api_client.get(f"{base_url}/api/rsvp/summary", headers=president_headers)
        assert r.status_code == 200
        row = [x for x in r.json() if x["event_id"] == TestEventRsvp.event_id]
        assert len(row) == 1
        row = row[0]
        assert row["yes"] == 1
        assert row["headcount"] == 3  # 1 user + 2 plus_ones

    def test_user1_upserts_to_no(self, api_client, base_url, member_headers):
        r = api_client.post(
            f"{base_url}/api/events/{TestEventRsvp.event_id}/rsvp",
            json={"status": "no", "plus_ones": 0}, headers=member_headers,
        )
        assert r.status_code == 200
        # Still exactly 1 record (upsert, not duplicate)
        r2 = api_client.get(
            f"{base_url}/api/events/{TestEventRsvp.event_id}/rsvps",
            headers=member_headers,
        )
        items = r2.json()
        assert len(items) == 1
        assert items[0]["status"] == "no"
        assert items[0]["plus_ones"] == 0
        # summary yes=0, headcount=0
        r3 = api_client.get(f"{base_url}/api/rsvp/summary",
                            headers=member_headers)
        row = [x for x in r3.json() if x["event_id"] == TestEventRsvp.event_id][0]
        assert row["yes"] == 0
        assert row["no"] == 1
        assert row["headcount"] == 0

    def test_user2_rsvps_yes_plus1(self, api_client, base_url, second_member_headers,
                                    president_headers):
        r = api_client.post(
            f"{base_url}/api/events/{TestEventRsvp.event_id}/rsvp",
            json={"status": "yes", "plus_ones": 1}, headers=second_member_headers,
        )
        assert r.status_code == 200
        # Now list should be 2 rsvps total
        r2 = api_client.get(
            f"{base_url}/api/events/{TestEventRsvp.event_id}/rsvps",
            headers=president_headers,
        )
        items = r2.json()
        assert len(items) == 2
        # summary yes=1 (only user2), headcount=2
        r3 = api_client.get(f"{base_url}/api/rsvp/summary",
                            headers=president_headers)
        row = [x for x in r3.json() if x["event_id"] == TestEventRsvp.event_id][0]
        assert row["yes"] == 1
        assert row["no"] == 1
        assert row["headcount"] == 2
