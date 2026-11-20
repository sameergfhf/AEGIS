from __future__ import annotations

import pytest
from app.api import auth


async def test_create_and_verify_access_token():
    token = auth.create_access_token("test-user-id", "test@example.com")
    user = await auth._verify_access_token(token)
    assert user.id == "test-user-id"
    assert user.email == "test@example.com"
    assert user.access_token == token


def test_password_hashing():
    pw = "supersecret123"
    hashed = auth.hash_password(pw)
    assert hashed != pw
    assert auth.verify_password(pw, hashed) is True
    assert auth.verify_password("wrongpassword", hashed) is False
