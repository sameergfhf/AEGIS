from __future__ import annotations

import time
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest

from app.api import auth


def run_without_event_loop(coroutine):
    """Run auth paths that perform no network awaits without platform loop setup."""
    try:
        coroutine.send(None)
    except StopIteration as completed:
        return completed.value
    raise AssertionError("The test exercised an unexpected asynchronous operation.")


@pytest.fixture
def signing_secret(monkeypatch):
    secret = "test-only-supabase-jwt-secret-with-sufficient-length"
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(
            supabase_auth_url="https://auth.example.test",
            supabase_url="",
            supabase_jwt_secret=secret,
            supabase_jwt_audience="authenticated",
            supabase_jwks_cache_seconds=300,
        ),
    )

    return secret


def issue_token(secret, *, expires_at=None, issuer="https://auth.example.test/auth/v1", audience="authenticated"):
    now = int(time.time())
    return jwt.encode(
        {
            "sub": str(uuid4()),
            "email": "user@example.test",
            "role": "authenticated",
            "iss": issuer,
            "aud": audience,
            "iat": now,
            "exp": expires_at if expires_at is not None else now + 300,
        },
        secret,
        algorithm="HS256",
    )


def test_verified_supabase_access_token_returns_user(signing_secret):
    token = issue_token(signing_secret)

    user = run_without_event_loop(auth._verify_access_token(token))

    assert user.id
    assert user.email == "user@example.test"
    assert user.access_token == token


def test_expired_access_token_is_rejected(signing_secret):
    token = issue_token(signing_secret, expires_at=int(time.time()) - 60)

    with pytest.raises(auth.TokenVerificationError, match="invalid or expired"):
        run_without_event_loop(auth._verify_access_token(token))


def test_invalid_signature_is_rejected(signing_secret):
    token = issue_token(signing_secret)
    forged = jwt.encode(
        jwt.decode(token, options={"verify_signature": False}),
        "different-secret-with-sufficient-length-for-hs256",
        algorithm="HS256",
    )

    with pytest.raises(auth.TokenVerificationError, match="invalid or expired"):
        run_without_event_loop(auth._verify_access_token(forged))


def test_wrong_issuer_is_rejected(signing_secret):
    token = issue_token(signing_secret, issuer="https://attacker.example/auth/v1")

    with pytest.raises(auth.TokenVerificationError, match="invalid or expired"):
        run_without_event_loop(auth._verify_access_token(token))


def test_identity_headers_cannot_authenticate_a_guest_request():
    # The dependency accepts only Authorization; client identity headers are not
    # part of its signature and therefore cannot produce a UserContext.
    user = run_without_event_loop(auth.get_current_user_optional(authorization=None))

    assert user is None
