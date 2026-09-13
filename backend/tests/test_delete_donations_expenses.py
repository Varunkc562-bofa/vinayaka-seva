"""Vinayaka Seva - DELETE donation & expense endpoints tests (iteration 9).

Covers:
- DELETE /api/donations/{id} (any authenticated user)
- DELETE /api/donations/{missing} → 404
- Dashboard & pending-dues recompute after donation delete
- DELETE /api/expenses/{id} (any authenticated user)
- DELETE /api/expenses/{missing} → 404
- Dashboard recompute after expense delete
- 401 without Bearer token
"""


class TestDeleteDonation:
    def test_delete_donation_as_regular_member(self, api_client, base_url,
                                                president_headers, member_headers, mongo_db):
        # Create as president
        r = api_client.post(f"{base_url}/api/donations",
            json={"donor_name": "TEST_DEL_Full", "amount": 800.0,
                  "paid_amount": 800.0, "mode": "cash", "send_sms": False},
            headers=president_headers)
        assert r.status_code == 200, r.text
        did = r.json()["donation_id"]

        # Delete as regular member (MVP: any auth user)
        r2 = api_client.delete(f"{base_url}/api/donations/{did}", headers=member_headers)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("ok") is True
        assert body.get("deleted") == 1

        # GET /donations must no longer include it
        r3 = api_client.get(f"{base_url}/api/donations", headers=president_headers)
        assert r3.status_code == 200
        ids = {d["donation_id"] for d in r3.json()}
        assert did not in ids

        # Confirm removed from Mongo
        assert mongo_db.donations.find_one({"donation_id": did}) is None

    def test_delete_donation_missing_id_returns_404(self, api_client, base_url, president_headers):
        r = api_client.delete(f"{base_url}/api/donations/don_does_not_exist_xyz",
                              headers=president_headers)
        assert r.status_code == 404

    def test_delete_donation_without_token_401(self, api_client, base_url, president_headers, mongo_db):
        r = api_client.post(f"{base_url}/api/donations",
            json={"donor_name": "TEST_DEL_AuthGuard", "amount": 100.0, "send_sms": False},
            headers=president_headers)
        did = r.json()["donation_id"]
        try:
            # No Authorization header
            r2 = api_client.delete(f"{base_url}/api/donations/{did}",
                                   headers={"Content-Type": "application/json",
                                            "Authorization": ""})
            assert r2.status_code == 401
        finally:
            mongo_db.donations.delete_one({"donation_id": did})


class TestDashboardAfterDonationDelete:
    def test_dashboard_and_pending_dues_recompute_on_delete(self, api_client, base_url,
                                                             president_headers, mongo_db):
        # Baseline
        base = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        base_donations = float(base["total_donations"])
        base_dues_total = float(base.get("pending_dues_total", 0))
        base_dues_count = int(base.get("pending_dues_count", 0))
        base_balance = float(base["balance"])

        # Add partial pledge 1500 / paid 400 → contributes 400 to total, 1100 to dues, +1 count
        r = api_client.post(f"{base_url}/api/donations",
            json={"donor_name": "TEST_DEL_Partial", "amount": 1500.0,
                  "paid_amount": 400.0, "mode": "cash", "send_sms": False},
            headers=president_headers)
        assert r.status_code == 200
        did = r.json()["donation_id"]

        after_add = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        assert round(float(after_add["total_donations"]) - base_donations, 2) == 400.0
        assert round(float(after_add["pending_dues_total"]) - base_dues_total, 2) == 1100.0
        assert after_add["pending_dues_count"] - base_dues_count == 1

        # Pending-dues should include it
        pd_add = api_client.get(f"{base_url}/api/pending-dues", headers=president_headers).json()
        assert did in {i["donation_id"] for i in pd_add}

        # DELETE
        rd = api_client.delete(f"{base_url}/api/donations/{did}", headers=president_headers)
        assert rd.status_code == 200

        # Dashboard should be back to baseline
        after_del = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        assert round(float(after_del["total_donations"]) - base_donations, 2) == 0.0, \
            f"total_donations not restored: base={base_donations} after={after_del['total_donations']}"
        assert round(float(after_del["pending_dues_total"]) - base_dues_total, 2) == 0.0
        assert int(after_del["pending_dues_count"]) - base_dues_count == 0
        assert round(float(after_del["balance"]) - base_balance, 2) == 0.0

        # pending-dues no longer contains it
        pd_del = api_client.get(f"{base_url}/api/pending-dues", headers=president_headers).json()
        assert did not in {i["donation_id"] for i in pd_del}


class TestDeleteExpense:
    def test_delete_expense_as_regular_member(self, api_client, base_url,
                                               president_headers, member_headers, mongo_db):
        r = api_client.post(f"{base_url}/api/expenses",
            json={"amount": 250.0, "category": "misc", "vendor": "TEST_DEL_V",
                  "description": "to-be-deleted"},
            headers=president_headers)
        assert r.status_code == 200
        eid = r.json()["expense_id"]

        r2 = api_client.delete(f"{base_url}/api/expenses/{eid}", headers=member_headers)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("ok") is True
        assert body.get("deleted") == 1

        # GET /expenses must no longer contain it
        r3 = api_client.get(f"{base_url}/api/expenses", headers=president_headers)
        ids = {e["expense_id"] for e in r3.json()}
        assert eid not in ids

        assert mongo_db.expenses.find_one({"expense_id": eid}) is None

    def test_delete_expense_missing_id_returns_404(self, api_client, base_url, president_headers):
        r = api_client.delete(f"{base_url}/api/expenses/exp_does_not_exist_xyz",
                              headers=president_headers)
        assert r.status_code == 404

    def test_delete_expense_without_token_401(self, api_client, base_url, president_headers, mongo_db):
        r = api_client.post(f"{base_url}/api/expenses",
            json={"amount": 42.0, "category": "misc"},
            headers=president_headers)
        eid = r.json()["expense_id"]
        try:
            r2 = api_client.delete(f"{base_url}/api/expenses/{eid}",
                                   headers={"Content-Type": "application/json",
                                            "Authorization": ""})
            assert r2.status_code == 401
        finally:
            mongo_db.expenses.delete_one({"expense_id": eid})


class TestDashboardAfterExpenseDelete:
    def test_total_expenses_and_balance_restore(self, api_client, base_url,
                                                  president_headers, mongo_db):
        base = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        base_expenses = float(base["total_expenses"])
        base_balance = float(base["balance"])

        r = api_client.post(f"{base_url}/api/expenses",
            json={"amount": 777.0, "category": "misc", "vendor": "TEST_DEL_DashV",
                  "description": "dashboard-delete"},
            headers=president_headers)
        eid = r.json()["expense_id"]

        after_add = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        assert round(float(after_add["total_expenses"]) - base_expenses, 2) == 777.0
        assert round(float(after_add["balance"]) - base_balance, 2) == -777.0

        rd = api_client.delete(f"{base_url}/api/expenses/{eid}", headers=president_headers)
        assert rd.status_code == 200

        after_del = api_client.get(f"{base_url}/api/dashboard", headers=president_headers).json()
        assert round(float(after_del["total_expenses"]) - base_expenses, 2) == 0.0
        assert round(float(after_del["balance"]) - base_balance, 2) == 0.0
