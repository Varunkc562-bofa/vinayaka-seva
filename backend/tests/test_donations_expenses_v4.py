"""Vinayaka Seva v4 backend tests: donation paid_amount, PATCH donations/expenses,
pending-dues, dashboard breakdown, backward compatibility."""
import uuid
from datetime import datetime, timezone

import pytest


# ---------- Donations: paid_amount defaults & clamping ----------
class TestDonationPaidAmount:
    def test_post_without_paid_amount_defaults_full(self, api_client, base_url, president_headers, mongo_db):
        payload = {"donor_name": "TEST_FullPay", "amount": 1000.0, "mode": "cash", "send_sms": False}
        r = api_client.post(f"{base_url}/api/donations", json=payload, headers=president_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == 1000.0
        assert d["paid_amount"] == 1000.0
        # Cleanup
        mongo_db.donations.delete_one({"donation_id": d["donation_id"]})

    def test_post_with_partial_paid(self, api_client, base_url, president_headers, mongo_db):
        payload = {"donor_name": "TEST_Partial", "amount": 1000.0, "paid_amount": 400.0,
                   "mode": "upi", "send_sms": False}
        r = api_client.post(f"{base_url}/api/donations", json=payload, headers=president_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paid_amount"] == 400.0
        assert d["amount"] == 1000.0
        mongo_db.donations.delete_one({"donation_id": d["donation_id"]})

    def test_post_clamps_paid_over_amount(self, api_client, base_url, president_headers, mongo_db):
        payload = {"donor_name": "TEST_Over", "amount": 1000.0, "paid_amount": 1500.0,
                   "mode": "cash", "send_sms": False}
        r = api_client.post(f"{base_url}/api/donations", json=payload, headers=president_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paid_amount"] == 1000.0
        mongo_db.donations.delete_one({"donation_id": d["donation_id"]})

    def test_post_clamps_negative_paid_to_zero(self, api_client, base_url, president_headers, mongo_db):
        payload = {"donor_name": "TEST_Neg", "amount": 1000.0, "paid_amount": -50.0,
                   "mode": "cash", "send_sms": False}
        r = api_client.post(f"{base_url}/api/donations", json=payload, headers=president_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["paid_amount"] == 0.0
        mongo_db.donations.delete_one({"donation_id": d["donation_id"]})


# ---------- PATCH /api/donations/{id} ----------
class TestDonationPatch:
    def test_patch_completes_partial(self, api_client, base_url, president_headers, mongo_db):
        # Create partial
        r = api_client.post(f"{base_url}/api/donations",
                            json={"donor_name": "TEST_PatchDone", "amount": 1000.0,
                                  "paid_amount": 200.0, "mode": "cash", "send_sms": False},
                            headers=president_headers)
        did = r.json()["donation_id"]
        # PATCH with just paid_amount=1000 -> completes
        r2 = api_client.patch(f"{base_url}/api/donations/{did}",
                              json={"paid_amount": 1000.0}, headers=president_headers)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["amount"] == 1000.0
        assert d["paid_amount"] == 1000.0
        mongo_db.donations.delete_one({"donation_id": did})

    def test_patch_amount_and_paid(self, api_client, base_url, president_headers, mongo_db):
        r = api_client.post(f"{base_url}/api/donations",
                            json={"donor_name": "TEST_BothChange", "amount": 500.0,
                                  "paid_amount": 100.0, "mode": "cash", "send_sms": False},
                            headers=president_headers)
        did = r.json()["donation_id"]
        r2 = api_client.patch(f"{base_url}/api/donations/{did}",
                              json={"amount": 2000.0, "paid_amount": 500.0},
                              headers=president_headers)
        assert r2.status_code == 200
        d = r2.json()
        assert d["amount"] == 2000.0
        assert d["paid_amount"] == 500.0
        mongo_db.donations.delete_one({"donation_id": did})

    def test_patch_no_fields_returns_400(self, api_client, base_url, president_headers, mongo_db):
        r = api_client.post(f"{base_url}/api/donations",
                            json={"donor_name": "TEST_NoFields", "amount": 100.0, "send_sms": False},
                            headers=president_headers)
        did = r.json()["donation_id"]
        r2 = api_client.patch(f"{base_url}/api/donations/{did}", json={},
                              headers=president_headers)
        assert r2.status_code == 400
        mongo_db.donations.delete_one({"donation_id": did})

    def test_patch_missing_id_returns_404(self, api_client, base_url, president_headers):
        r = api_client.patch(f"{base_url}/api/donations/don_doesnotexist_xyz",
                             json={"paid_amount": 100.0}, headers=president_headers)
        assert r.status_code == 404


# ---------- GET /api/pending-dues ----------
class TestPendingDues:
    def test_pending_dues_only_partial(self, api_client, base_url, president_headers, mongo_db):
        # Clean starting state to keep counts predictable
        mongo_db.donations.delete_many({"donor_name": {"$regex": "^TEST_PD_"}})
        # Fully paid
        r_full = api_client.post(f"{base_url}/api/donations",
                                 json={"donor_name": "TEST_PD_Full", "amount": 500.0, "send_sms": False},
                                 headers=president_headers)
        full_id = r_full.json()["donation_id"]
        # Partial
        r_part = api_client.post(f"{base_url}/api/donations",
                                 json={"donor_name": "TEST_PD_Partial", "amount": 1000.0,
                                       "paid_amount": 300.0, "send_sms": False},
                                 headers=president_headers)
        part_id = r_part.json()["donation_id"]

        r = api_client.get(f"{base_url}/api/pending-dues", headers=president_headers)
        assert r.status_code == 200
        items = r.json()
        ids = {i["donation_id"]: i for i in items}
        assert full_id not in ids, "Fully paid donations must not appear"
        assert part_id in ids
        assert ids[part_id]["remaining"] == 700.0
        assert ids[part_id]["amount"] == 1000.0
        assert ids[part_id]["paid_amount"] == 300.0

        mongo_db.donations.delete_one({"donation_id": full_id})
        mongo_db.donations.delete_one({"donation_id": part_id})


# ---------- GET /api/dashboard ----------
class TestDashboard:
    def test_dashboard_uses_paid_amount(self, api_client, base_url, president_headers, mongo_db):
        # Baseline totals
        base_r = api_client.get(f"{base_url}/api/dashboard", headers=president_headers)
        assert base_r.status_code == 200
        base = base_r.json()
        base_donations = float(base["total_donations"])
        base_dues_total = float(base.get("pending_dues_total", 0))
        base_dues_count = int(base.get("pending_dues_count", 0))

        # Add partial pledge 1000 / 400
        r = api_client.post(f"{base_url}/api/donations",
                            json={"donor_name": "TEST_DashPartial", "amount": 1000.0,
                                  "paid_amount": 400.0, "send_sms": False},
                            headers=president_headers)
        did = r.json()["donation_id"]

        r2 = api_client.get(f"{base_url}/api/dashboard", headers=president_headers)
        assert r2.status_code == 200
        after = r2.json()

        # total_donations increases by paid (400), not pledged (1000)
        assert round(float(after["total_donations"]) - base_donations, 2) == 400.0, \
            f"total_donations should add paid_amount 400, got {after['total_donations']} vs base {base_donations}"
        assert round(float(after["pending_dues_total"]) - base_dues_total, 2) == 600.0
        assert after["pending_dues_count"] - base_dues_count == 1

        # Balance = total_donations - total_expenses (no pledged)
        assert round(float(after["balance"]) - (float(after["total_donations"]) - float(after["total_expenses"])), 2) == 0.0

        mongo_db.donations.delete_one({"donation_id": did})


# ---------- Backward Compatibility: legacy donations w/o paid_amount ----------
class TestBackwardCompat:
    def test_legacy_donation_treated_as_paid(self, api_client, base_url, president_headers, mongo_db, president):
        # Baseline dashboard
        b = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        base_total = float(b["total_donations"])
        base_dues_count = int(b.get("pending_dues_count", 0))

        # Insert legacy donation directly (no paid_amount field)
        legacy_id = f"don_legacy_{uuid.uuid4().hex[:8]}"
        mongo_db.donations.insert_one({
            "donation_id": legacy_id,
            "committee_id": president["committee_id"],
            "donor_name": "TEST_Legacy",
            "amount": 750.0,
            "mode": "cash",
            "created_at": datetime.now(timezone.utc),
            "created_by": "System",
        })

        # Pending dues must NOT include it
        pd = api_client.get(f"{base_url}/api/pending-dues", headers=president_headers).json()
        assert legacy_id not in {i["donation_id"] for i in pd}, \
            "Legacy donation (no paid_amount) must be treated as fully paid"

        # Dashboard: total_donations should include the full 750
        d = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        assert round(float(d["total_donations"]) - base_total, 2) == 750.0
        assert int(d["pending_dues_count"]) == base_dues_count

        mongo_db.donations.delete_one({"donation_id": legacy_id})


# ---------- PATCH /api/expenses/{id} ----------
class TestExpensePatch:
    def test_edit_expense_as_regular_member(self, api_client, base_url, president_headers,
                                             member_headers, mongo_db):
        # Create expense (any user can)
        r = api_client.post(f"{base_url}/api/expenses",
                            json={"amount": 100.0, "category": "misc", "vendor": "Old",
                                  "description": "old desc"},
                            headers=president_headers)
        eid = r.json()["expense_id"]

        # Regular member edits it -> allowed
        r2 = api_client.patch(f"{base_url}/api/expenses/{eid}",
                              json={"amount": 250.0, "category": "food",
                                    "vendor": "NewVendor", "description": "updated"},
                              headers=member_headers)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d["amount"] == 250.0
        assert d["category"] == "food"
        assert d["vendor"] == "NewVendor"
        assert d["description"] == "updated"
        mongo_db.expenses.delete_one({"expense_id": eid})

    def test_edit_expense_no_fields_400(self, api_client, base_url, president_headers, mongo_db):
        r = api_client.post(f"{base_url}/api/expenses",
                            json={"amount": 100.0, "category": "misc"},
                            headers=president_headers)
        eid = r.json()["expense_id"]
        r2 = api_client.patch(f"{base_url}/api/expenses/{eid}", json={}, headers=president_headers)
        assert r2.status_code == 400
        mongo_db.expenses.delete_one({"expense_id": eid})

    def test_edit_expense_missing_id_404(self, api_client, base_url, president_headers):
        r = api_client.patch(f"{base_url}/api/expenses/exp_doesnotexist",
                             json={"amount": 1.0}, headers=president_headers)
        assert r.status_code == 404

    def test_approve_still_rbac_gated(self, api_client, base_url, president_headers,
                                       member_headers, mongo_db):
        r = api_client.post(f"{base_url}/api/expenses",
                            json={"amount": 50.0, "category": "misc"},
                            headers=president_headers)
        eid = r.json()["expense_id"]
        # Regular member cannot approve
        r2 = api_client.patch(f"{base_url}/api/expenses/{eid}/approve", headers=member_headers)
        assert r2.status_code == 403
        # President can
        r3 = api_client.patch(f"{base_url}/api/expenses/{eid}/approve", headers=president_headers)
        assert r3.status_code == 200
        mongo_db.expenses.delete_one({"expense_id": eid})
