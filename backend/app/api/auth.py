"""
app/api/auth.py — Native JWT token verification, password hashing, and user dependencies.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import os
import time
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status

from app.config import get_settings


@dataclass(frozen=True)
class UserContext:
    id: str
    email: str | None = None
    access_token: str = field(default="", repr=False, compare=False)


# ── Password Utilities ────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password using salted PBKDF2-HMAC-SHA256."""
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return f"{salt}${hashed}"


def verify_password(password: str, hashed_password: str | None) -> bool:
    """Verify password against stored salt$hash string."""
    if not hashed_password or "$" not in hashed_password:
        return False
    try:
        salt, stored_hash = hashed_password.split("$", 1)
        calc = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
        return calc == stored_hash
    except Exception:
        return False


# ── Token Generation ──────────────────────────────────────────────────────────

def create_access_token(user_id: str, email: str | None = None, expires_delta: timedelta | None = None) -> str:
    """Generate a signed JWT access token."""
    settings = get_settings()
    secret = settings.jwt_secret_key or settings.secret_key
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.jwt_expire_minutes))
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, secret, algorithm=settings.jwt_algorithm)


# ── Token Verification ────────────────────────────────────────────────────────

class TokenVerificationError(Exception):
    """Raised when an access token cannot be verified."""


async def _verify_access_token(token: str) -> UserContext:
    settings = get_settings()
    secret = settings.jwt_secret_key or settings.secret_key

    # Native JWT Verification
    try:
        claims = jwt.decode(
            token,
            key=secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
            leeway=30,
        )
        sub = claims.get("sub")
        if not sub:
            raise TokenVerificationError("Invalid token: missing subject.")
        return UserContext(id=str(sub), email=claims.get("email"), access_token=token)
    except jwt.ExpiredSignatureError:
        raise TokenVerificationError("Access token has expired.")
    except jwt.InvalidTokenError as exc:
        raise TokenVerificationError("Access token is invalid.") from exc


async def get_current_user_optional(
    authorization: str | None = Header(default=None),
) -> UserContext | None:
    """Verify a supplied bearer token; preserve guest access only when absent."""
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A valid Bearer token is required.")
    try:
        return await _verify_access_token(token.strip())
    except TokenVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


async def get_current_user(
    user: UserContext | None = Depends(get_current_user_optional),
) -> UserContext:
    """Require a verified user."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required.")
    return user
