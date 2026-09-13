"""Shared fixtures for Vinayaka Seva backend tests."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
load_dotenv(BACKEND_ENV)
load_dotenv(FRONTEND_ENV, override=False)

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
).rstrip("/")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _make_user(mongo_db, role: str, email_prefix: str = "test"):
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    email = f"TEST_{email_prefix}_{uuid.uuid4().hex[:6]}@example.com"
    token = f"TEST_tok_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    mongo_db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": f"Test {role}",
        "role": role,
        "picture": None,
        "phone": None,
        "created_at": now,
    })
    mongo_db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": now + timedelta(days=1),
        "created_at": now,
    })
    return {"user_id": user_id, "email": email, "token": token, "role": role, "name": f"Test {role}"}


@pytest.fixture(scope="session")
def president(mongo_db):
    user = _make_user(mongo_db, "President", "president")
    yield user
    # cleanup
    mongo_db.user_sessions.delete_one({"session_token": user["token"]})
    mongo_db.users.delete_one({"user_id": user["user_id"]})


@pytest.fixture(scope="session")
def regular_member(mongo_db):
    user = _make_user(mongo_db, "Regular Member", "member")
    yield user
    mongo_db.user_sessions.delete_one({"session_token": user["token"]})
    mongo_db.users.delete_one({"user_id": user["user_id"]})


@pytest.fixture(scope="session")
def president_headers(president):
    return {"Authorization": f"Bearer {president['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def member_headers(regular_member):
    return {"Authorization": f"Bearer {regular_member['token']}", "Content-Type": "application/json"}
