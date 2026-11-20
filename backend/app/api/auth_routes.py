"""
app/api/auth_routes.py — Native authentication & OAuth endpoints (Google, GitHub, Email/Password).
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import UserContext, create_access_token, get_current_user, hash_password, verify_password
from app.config import get_settings
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


# ── Schemas ───────────────────────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class SignInRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    provider: str = "local"

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Email / Password Auth ─────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignUpRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account with email and password."""
    email_clean = payload.email.lower().strip()

    # Check if user already exists
    existing = await db.execute(select(User).where(User.email == email_clean))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    new_user = User(
        id=str(uuid.uuid4()),
        email=email_clean,
        full_name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        provider="local",
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token = create_access_token(new_user.id, new_user.email)
    return AuthResponse(access_token=token, user=UserOut.model_validate(new_user))


@router.post("/signin", response_model=AuthResponse)
async def signin(payload: SignInRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email and password."""
    email_clean = payload.email.lower().strip()

    result = await db.execute(select(User).where(User.email == email_clean))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user.id, user.email)
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def get_me(user_ctx: UserContext = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Get the profile of the currently authenticated user."""
    result = await db.execute(select(User).where(User.id == user_ctx.id))
    user = result.scalar_one_or_none()

    if not user:
        # Fallback for JWTs matching email
        if user_ctx.email:
            result = await db.execute(select(User).where(User.email == user_ctx.email))
            user = result.scalar_one_or_none()

    if not user:
        # Auto-create entry if verified externally
        user = User(
            id=user_ctx.id,
            email=user_ctx.email or f"{user_ctx.id}@aegis.local",
            full_name=user_ctx.email.split("@")[0] if user_ctx.email else "Operator",
            provider="oauth",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return UserOut.model_validate(user)


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.get("/oauth/google")
async def google_oauth_start():
    """Initiate Google OAuth2 authorization redirect."""
    cfg = get_settings()
    if not cfg.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth is not configured on this server.")

    redirect_uri = f"{cfg.backend_url.rstrip('/')}/api/auth/oauth/google/callback"
    params = {
        "client_id": cfg.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/oauth/google/callback")
async def google_oauth_callback(
    code: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth2 callback code and issue JWT."""
    cfg = get_settings()
    redirect_uri = f"{cfg.backend_url.rstrip('/')}/api/auth/oauth/google/callback"

    # Exchange code for token
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": cfg.google_client_id,
                "client_secret": cfg.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            logger.error("Google token exchange failed: %s", token_res.text)
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code with Google.")

        token_data = token_res.json()
        access_token = token_data.get("access_token")

        # Fetch Google user profile
        userinfo_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch user profile from Google.")

        userinfo = userinfo_res.json()

    email = userinfo.get("email", "").lower().strip()
    name = userinfo.get("name") or email.split("@")[0]
    picture = userinfo.get("picture")

    if not email:
        raise HTTPException(status_code=400, detail="Google account did not provide an email address.")

    # Find or create user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email,
            full_name=name,
            avatar_url=picture,
            provider="google",
        )
        db.add(user)
    else:
        if picture and not user.avatar_url:
            user.avatar_url = picture
        if not user.full_name:
            user.full_name = name

    await db.commit()
    await db.refresh(user)

    jwt_token = create_access_token(user.id, user.email)
    frontend = cfg.frontend_url.rstrip("/")
    return RedirectResponse(f"{frontend}/auth/callback?token={jwt_token}")


# ── GitHub OAuth ──────────────────────────────────────────────────────────────

@router.get("/oauth/github")
async def github_oauth_start():
    """Initiate GitHub OAuth2 authorization redirect."""
    cfg = get_settings()
    if not cfg.github_client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth is not configured on this server.")

    redirect_uri = f"{cfg.backend_url.rstrip('/')}/api/auth/oauth/github/callback"
    params = {
        "client_id": cfg.github_client_id,
        "redirect_uri": redirect_uri,
        "scope": "user:email read:user",
    }
    url = f"https://github.com/login/oauth/authorize?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/oauth/github/callback")
async def github_oauth_callback(
    code: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle GitHub OAuth2 callback code and issue JWT."""
    cfg = get_settings()
    redirect_uri = f"{cfg.backend_url.rstrip('/')}/api/auth/oauth/github/callback"

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Exchange code for access token
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": cfg.github_client_id,
                "client_secret": cfg.github_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        if token_res.status_code != 200:
            logger.error("GitHub token exchange failed: %s", token_res.text)
            raise HTTPException(status_code=400, detail="Failed to exchange authorization code with GitHub.")

        token_data = token_res.json()
        gh_token = token_data.get("access_token")
        if not gh_token:
            raise HTTPException(status_code=400, detail="GitHub did not return an access token.")

        # Fetch GitHub user profile
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/json"},
        )
        if user_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch GitHub user profile.")
        gh_user = user_res.json()

        # Fetch GitHub verified emails
        email = gh_user.get("email")
        if not email:
            emails_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/json"},
            )
            if emails_res.status_code == 200:
                emails_list = emails_res.json()
                primary_email = next((e["email"] for e in emails_list if e.get("primary") and e.get("verified")), None)
                if not primary_email and emails_list:
                    primary_email = emails_list[0].get("email")
                email = primary_email

    if not email:
        raise HTTPException(status_code=400, detail="Could not obtain a verified email address from GitHub.")

    email_clean = email.lower().strip()
    name = gh_user.get("name") or gh_user.get("login") or email_clean.split("@")[0]
    avatar = gh_user.get("avatar_url")

    # Find or create user
    result = await db.execute(select(User).where(User.email == email_clean))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=email_clean,
            full_name=name,
            avatar_url=avatar,
            provider="github",
        )
        db.add(user)
    else:
        if avatar and not user.avatar_url:
            user.avatar_url = avatar
        if not user.full_name:
            user.full_name = name

    await db.commit()
    await db.refresh(user)

    jwt_token = create_access_token(user.id, user.email)
    frontend = cfg.frontend_url.rstrip("/")
    return RedirectResponse(f"{frontend}/auth/callback?token={jwt_token}")
