"""Vinayaka Seva v2 backend tests: uploads, files, gallery, polls."""
import io
import struct
import warnings

import pytest
import requests


def _make_png_bytes() -> bytes:
    """Minimal valid 1x1 red PNG (avoid PIL dependency)."""
    return (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01"
        b"\x5b\x84\x60\x2b"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )


# ---------- Uploads + Files (Emergent Object Storage) ----------
class TestUploadsAndFiles:
    storage_path = None
    upload_size = None
    storage_unavailable = False
    png_bytes = None

    def test_upload_png(self, api_client, base_url, president):
        png = _make_png_bytes()
        TestUploadsAndFiles.png_bytes = png
        # Use a fresh session (multipart doesn't want the default JSON content-type header)
        headers = {"Authorization": f"Bearer {president['token']}"}
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{base_url}/api/upload", headers=headers, files=files,
                          params={"folder": "test"}, timeout=60)
        if r.status_code == 502 and "storage" in r.text.lower():
            warnings.warn(f"WARNING: Emergent Object Storage unavailable: {r.text[:200]}")
            TestUploadsAndFiles.storage_unavailable = True
            pytest.skip("storage unavailable")
        assert r.status_code == 200, f"upload failed {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "storage_path" in data and data["storage_path"]
        assert "url" in data and data["url"].startswith("/api/files/")
        assert data["size"] == len(png)
        TestUploadsAndFiles.storage_path = data["storage_path"]
        TestUploadsAndFiles.upload_size = data["size"]

    def test_download_with_valid_token(self, api_client, base_url, president_headers):
        if TestUploadsAndFiles.storage_unavailable:
            pytest.skip("storage unavailable")
        assert TestUploadsAndFiles.storage_path, "no storage_path from upload"
        r = requests.get(
            f"{base_url}/api/files/{TestUploadsAndFiles.storage_path}",
            headers={"Authorization": president_headers["Authorization"]},
            timeout=60,
        )
        assert r.status_code == 200, f"download failed {r.status_code}: {r.text[:200]}"
        assert r.content == TestUploadsAndFiles.png_bytes
        # PNG magic bytes
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"

    def test_download_without_token(self, base_url):
        if TestUploadsAndFiles.storage_unavailable:
            pytest.skip("storage unavailable")
        assert TestUploadsAndFiles.storage_path
        r = requests.get(
            f"{base_url}/api/files/{TestUploadsAndFiles.storage_path}", timeout=30
        )
        assert r.status_code == 401

    def test_download_with_wrong_token(self, base_url):
        if TestUploadsAndFiles.storage_unavailable:
            pytest.skip("storage unavailable")
        assert TestUploadsAndFiles.storage_path
        r = requests.get(
            f"{base_url}/api/files/{TestUploadsAndFiles.storage_path}",
            headers={"Authorization": "Bearer completely-bogus-token"},
            timeout=30,
        )
        assert r.status_code == 401


# ---------- Gallery ----------
class TestGallery:
    my_photo_id = None
    other_photo_id = None

    def test_list_initial(self, api_client, base_url, president_headers, mongo_db):
        # Ensure empty gallery for a clean baseline
        mongo_db.gallery.delete_many({})
        r = api_client.get(f"{base_url}/api/gallery", headers=president_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_add_gallery_as_member(self, api_client, base_url, member_headers):
        payload = {"storage_path": "vinayaka-seva/uploads/gallery/fakeuser/abc.png",
                   "caption": "TEST_photo", "category": "cultural"}
        r = api_client.post(f"{base_url}/api/gallery", json=payload, headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["photo_id"].startswith("ph_")
        assert data["caption"] == "TEST_photo"
        assert data["category"] == "cultural"
        assert data["storage_path"] == payload["storage_path"]
        TestGallery.my_photo_id = data["photo_id"]

    def test_add_gallery_as_second_member(self, api_client, base_url, second_member_headers):
        payload = {"storage_path": "vinayaka-seva/uploads/gallery/fakeuser2/xyz.png",
                   "caption": "TEST_photo2", "category": "aarti"}
        r = api_client.post(f"{base_url}/api/gallery", json=payload, headers=second_member_headers)
        assert r.status_code == 200
        TestGallery.other_photo_id = r.json()["photo_id"]

    def test_list_non_empty(self, api_client, base_url, president_headers):
        r = api_client.get(f"{base_url}/api/gallery", headers=president_headers)
        assert r.status_code == 200
        items = r.json()
        ids = [x["photo_id"] for x in items]
        assert TestGallery.my_photo_id in ids
        assert TestGallery.other_photo_id in ids

    def test_delete_non_owner_forbidden(self, api_client, base_url, member_headers):
        # first regular member tries to delete second member's photo
        assert TestGallery.other_photo_id
        r = api_client.delete(
            f"{base_url}/api/gallery/{TestGallery.other_photo_id}",
            headers=member_headers,
        )
        assert r.status_code == 403

    def test_delete_own_ok(self, api_client, base_url, member_headers):
        assert TestGallery.my_photo_id
        r = api_client.delete(
            f"{base_url}/api/gallery/{TestGallery.my_photo_id}",
            headers=member_headers,
        )
        assert r.status_code == 200
        # verify gone
        r2 = api_client.get(f"{base_url}/api/gallery", headers=member_headers)
        ids = [x["photo_id"] for x in r2.json()]
        assert TestGallery.my_photo_id not in ids

    def test_delete_any_as_president(self, api_client, base_url, president_headers):
        assert TestGallery.other_photo_id
        r = api_client.delete(
            f"{base_url}/api/gallery/{TestGallery.other_photo_id}",
            headers=president_headers,
        )
        assert r.status_code == 200
        r2 = api_client.get(f"{base_url}/api/gallery", headers=president_headers)
        ids = [x["photo_id"] for x in r2.json()]
        assert TestGallery.other_photo_id not in ids


# ---------- Polls / Committee Decisions ----------
class TestPolls:
    poll_id = None
    anon_poll_id = None
    close_poll_id = None

    # ---- Validation ----
    def test_create_min_options_validation(self, api_client, base_url, president_headers):
        payload = {"question": "TEST_bad?", "options": ["only-one"]}
        r = api_client.post(f"{base_url}/api/polls", json=payload, headers=president_headers)
        assert r.status_code == 400

    # ---- Basic create + list ----
    def test_create_poll(self, api_client, base_url, president_headers, mongo_db, president):
        # clean slate for polls to make counts assertions deterministic
        mongo_db.polls.delete_many({})
        payload = {"question": "TEST_pandal_color?", "options": ["Red", "Blue"]}
        r = api_client.post(f"{base_url}/api/polls", json=payload, headers=president_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["poll_id"].startswith("poll_")
        assert data["question"] == "TEST_pandal_color?"
        assert data["options"] == ["Red", "Blue"]
        assert data["counts"] == [0, 0]
        assert data["total_votes"] == 0
        assert data["my_vote"] is None
        assert data["voters"] == []
        assert data["status"] == "open"
        assert data["anonymous"] is False
        assert data["created_by_id"] == president["user_id"]
        TestPolls.poll_id = data["poll_id"]

    def test_list_shows_new_poll(self, api_client, base_url, member_headers):
        r = api_client.get(f"{base_url}/api/polls", headers=member_headers)
        assert r.status_code == 200
        polls = r.json()
        match = [p for p in polls if p["poll_id"] == TestPolls.poll_id]
        assert len(match) == 1
        p = match[0]
        assert p["counts"] == [0, 0]
        assert p["total_votes"] == 0
        assert p["my_vote"] is None
        assert p["voters"] == []

    # ---- Voting: one-vote-per-user + tally ----
    def test_vote_bad_option(self, api_client, base_url, member_headers):
        r = api_client.post(f"{base_url}/api/polls/{TestPolls.poll_id}/vote",
                            json={"option_index": 99}, headers=member_headers)
        assert r.status_code == 400
        r2 = api_client.post(f"{base_url}/api/polls/{TestPolls.poll_id}/vote",
                             json={"option_index": -1}, headers=member_headers)
        assert r2.status_code == 400

    def test_same_user_double_vote_counts_once(self, api_client, base_url, member_headers,
                                                regular_member):
        # first regular member votes twice for option 0
        r1 = api_client.post(f"{base_url}/api/polls/{TestPolls.poll_id}/vote",
                             json={"option_index": 0}, headers=member_headers)
        assert r1.status_code == 200
        r2 = api_client.post(f"{base_url}/api/polls/{TestPolls.poll_id}/vote",
                             json={"option_index": 0}, headers=member_headers)
        assert r2.status_code == 200
        # verify only one vote logged
        r3 = api_client.get(f"{base_url}/api/polls", headers=member_headers)
        p = [x for x in r3.json() if x["poll_id"] == TestPolls.poll_id][0]
        assert p["total_votes"] == 1
        assert p["counts"] == [1, 0]
        assert p["my_vote"] == 0
        voter_ids = [v.get("user_name") for v in p["voters"]]
        assert regular_member["name"] in voter_ids

    def test_second_user_votes_option1(self, api_client, base_url, second_member_headers,
                                        second_member, president_headers):
        r = api_client.post(f"{base_url}/api/polls/{TestPolls.poll_id}/vote",
                            json={"option_index": 1}, headers=second_member_headers)
        assert r.status_code == 200
        # now tally: [1,1], total=2, voters len 2 with name+role
        r2 = api_client.get(f"{base_url}/api/polls", headers=president_headers)
        p = [x for x in r2.json() if x["poll_id"] == TestPolls.poll_id][0]
        assert p["counts"] == [1, 1]
        assert p["total_votes"] == 2
        assert len(p["voters"]) == 2
        for v in p["voters"]:
            assert "user_name" in v and v["user_name"]
            assert "user_role" in v and v["user_role"]
            assert "option_index" in v

    # ---- Anonymous poll ----
    def test_anonymous_poll(self, api_client, base_url, president_headers, member_headers,
                             second_member_headers):
        payload = {"question": "TEST_secret?", "options": ["A", "B"], "anonymous": True}
        r = api_client.post(f"{base_url}/api/polls", json=payload, headers=president_headers)
        assert r.status_code == 200
        TestPolls.anon_poll_id = r.json()["poll_id"]
        # two votes
        r1 = api_client.post(f"{base_url}/api/polls/{TestPolls.anon_poll_id}/vote",
                             json={"option_index": 0}, headers=member_headers)
        assert r1.status_code == 200
        r2 = api_client.post(f"{base_url}/api/polls/{TestPolls.anon_poll_id}/vote",
                             json={"option_index": 1}, headers=second_member_headers)
        assert r2.status_code == 200
        # GET as president
        r3 = api_client.get(f"{base_url}/api/polls", headers=president_headers)
        p = [x for x in r3.json() if x["poll_id"] == TestPolls.anon_poll_id][0]
        assert p["anonymous"] is True
        assert p["counts"] == [1, 1]
        assert p["total_votes"] == 2
        assert p["voters"] == []  # hidden

    # ---- Close poll ----
    def test_non_creator_non_officer_cannot_close(self, api_client, base_url,
                                                   president_headers, member_headers):
        # create poll as president; regular member (non-creator, non-officer) cannot close
        payload = {"question": "TEST_close?", "options": ["Yes", "No"]}
        r = api_client.post(f"{base_url}/api/polls", json=payload, headers=president_headers)
        TestPolls.close_poll_id = r.json()["poll_id"]
        r2 = api_client.post(f"{base_url}/api/polls/{TestPolls.close_poll_id}/close",
                             headers=member_headers)
        assert r2.status_code == 403

    def test_creator_can_close_then_vote_blocked(self, api_client, base_url,
                                                  president_headers, member_headers):
        assert TestPolls.close_poll_id
        r = api_client.post(f"{base_url}/api/polls/{TestPolls.close_poll_id}/close",
                            headers=president_headers)
        assert r.status_code == 200
        # subsequent vote returns 400 poll_closed
        r2 = api_client.post(f"{base_url}/api/polls/{TestPolls.close_poll_id}/vote",
                             json={"option_index": 0}, headers=member_headers)
        assert r2.status_code == 400
        assert "closed" in r2.text.lower()
