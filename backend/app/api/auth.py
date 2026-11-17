"""Supabase access-token verification and authenticated-user dependencies."""
from __future__ import annotations

import asyncio
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


_jwks_cache: dict[str, Any] = {"url": "", "expires_at": 0.0, "keys": []}
_jwks_lock = asyncio.Lock()
_ASYMMETRIC_ALGORITHMS = {"ES256", "ES384", "RS256", "RS384", "RS512", "EdDSA"}


class TokenVerificationError(Exception):
    """Raised when a Supabase access token cannot be verified."""


async def _fetch_jwks(jwks_url: str, *, force: bool = False) -> list[dict[str, Any]]:
    now = time.monotonic()
    if not force and _jwks_cache["url"] == jwks_url and _jwks_cache["expires_at"] > now:
        return _jwks_cache["keys"]

    async with _jwks_lock:
        now = time.monotonic()
        if not force and _jwks_cache["url"] == jwks_url and _jwks_cache["expires_at"] > now:
            return _jwks_cache["keys"]
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
                response = await client.get(jwks_url, headers={"Accept": "application/json"})
                response.raise_for_status()
                document = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise TokenVerificationError("Could not retrieve Supabase signing keys.") from exc

        keys = document.get("keys") if isinstance(document, dict) else None
        if not isinstance(keys, list) or not keys:
            raise TokenVerificationError("Supabase signing key set is missing or malformed.")
        cache_seconds = max(30, min(get_settings().supabase_jwks_cache_seconds, 3600))
        _jwks_cache.update(url=jwks_url, expires_at=now + cache_seconds, keys=keys)
        return keys


async def _verification_key(token: str, header: dict[str, Any]) -> tuple[Any, str]:
    settings = get_settings()
    algorithm = header.get("alg")
    if algorithm == "HS256":
        if not settings.supabase_jwt_secret:
            raise TokenVerificationError("Legacy HS256 token verification is not configured.")
        return settings.supabase_jwt_secret, "HS256"

    if algorithm not in _ASYMMETRIC_ALGORITHMS:
        raise TokenVerificationError("Unsupported access-token signing algorithm.")

    auth_url = (settings.supabase_auth_url or settings.supabase_url).rstrip("/")
    if not auth_url:
        raise TokenVerificationError("Supabase Auth URL is not configured.")
    jwks_url = f"{auth_url}/auth/v1/.well-known/jwks.json"
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise TokenVerificationError("Access token is missing its signing key identifier.")

    keys = await _fetch_jwks(jwks_url)
    jwk_data = next((item for item in keys if item.get("kid") == kid), None)
    if jwk_data is None:
        # A rotated key may appear before the cache expires. Refresh once.
        keys = await _fetch_jwks(jwks_url, force=True)
        jwk_data = next((item for item in keys if item.get("kid") == kid), None)
    if jwk_data is None or jwk_data.get("alg") not in (None, algorithm):
        raise TokenVerificationError("No matching Supabase signing key was found.")
    try:
        return jwt.PyJWK.from_dict(jwk_data, algorithm=algorithm).key, algorithm
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise TokenVerificationError("Supabase signing key is invalid.") from exc


async def _verify_access_token(token: str) -> UserContext:
    settings = get_settings()
    auth_url = (settings.supabase_auth_url or settings.supabase_url).rstrip("/")
    if not auth_url:
        raise TokenVerificationError("Supabase Auth URL is not configured.")
    try:
        header = jwt.get_unverified_header(token)
        key, algorithm = await _verification_key(token, header)
        claims = jwt.decode(
            token,
            key=key,
            algorithms=[algorithm],
            audience=settings.supabase_jwt_audience,
            issuer=f"{auth_url}/auth/v1",
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )
        subject = claims.get("sub")
        if not isinstance(subject, str):
            raise TokenVerificationError("Access token subject is invalid.")
        user_id = str(UUID(subject))
        if claims.get("role") != "authenticated":
            raise TokenVerificationError("Access token is not an authenticated user token.")
        email = claims.get("email")
        return UserContext(id=user_id, email=email if isinstance(email, str) else None, access_token=token)
    except TokenVerificationError:
        raise
    except (jwt.PyJWTError, ValueError, TypeError) as exc:
        raise TokenVerificationError("Access token is invalid or expired.") from exc


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
    """Require a verified Supabase Auth user."""
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required.")
    return user
