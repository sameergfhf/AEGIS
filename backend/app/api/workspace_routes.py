"""
app/api/workspace_routes.py — Native Workspace Management endpoints backed by Neon PostgreSQL.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import UserContext, get_current_user
from app.database import get_db
from app.models.workspace import (
    Workspace,
    WorkspaceMember,
    WorkspaceApi,
    WorkspaceSecurityPolicy,
    WorkspaceIncident,
    WorkspaceNotification,
)
from app.security.workspace_authorization import Permission, require_workspace_permission

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: Optional[str] = None
    description: Optional[str] = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    owner_id: str
    created_at: datetime
    role: str = "owner"

    model_config = {"from_attributes": True}


class MemberCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    role: str = Field(default="security_analyst")


class MemberUpdate(BaseModel):
    role: str


class ApiCreate(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    base_url: str = Field(min_length=8, max_length=2048)
    environment: str = Field(default="development")
    project_name: Optional[str] = None
    category: Optional[str] = None


class ApiUpdate(BaseModel):
    name: Optional[str] = None
    base_url: Optional[str] = None
    environment: Optional[str] = None
    project_name: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None


# ── Workspace CRUD ────────────────────────────────────────────────────────────

@router.get("", response_model=List[WorkspaceOut])
async def list_user_workspaces(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all workspaces the authenticated user owns or belongs to."""
    # Workspaces owned
    owned_res = await db.execute(select(Workspace).where(Workspace.owner_id == user.id))
    owned = owned_res.scalars().all()
    results = [
        WorkspaceOut(
            id=w.id,
            name=w.name,
            slug=w.slug,
            description=w.description,
            owner_id=w.owner_id,
            created_at=w.created_at,
            role="owner",
        )
        for w in owned
    ]
    owned_ids = {w.id for w in owned}

    # Workspaces where member
    mem_res = await db.execute(
        select(WorkspaceMember, Workspace)
        .join(Workspace, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == "active")
    )
    for m, w in mem_res.all():
        if w.id not in owned_ids:
            results.append(
                WorkspaceOut(
                    id=w.id,
                    name=w.name,
                    slug=w.slug,
                    description=w.description,
                    owner_id=w.owner_id,
                    created_at=w.created_at,
                    role=m.role,
                )
            )
            owned_ids.add(w.id)

    return results


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workspace."""
    slug = payload.slug or re.sub(r"[^a-z0-9]+", "-", payload.name.lower()).strip("-")
    if not slug:
        slug = f"workspace-{uuid.uuid4().hex[:6]}"

    # Ensure slug uniqueness
    existing = await db.execute(select(Workspace).where(Workspace.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    workspace = Workspace(
        id=str(uuid.uuid4()),
        name=payload.name.strip(),
        slug=slug,
        description=payload.description.strip() if payload.description else None,
        owner_id=user.id,
    )
    db.add(workspace)

    # Add owner as workspace member
    member = WorkspaceMember(
        id=str(uuid.uuid4()),
        workspace_id=workspace.id,
        user_id=user.id,
        email=user.email or f"{user.id}@aegis.local",
        role="owner",
        status="active",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(member)

    await db.commit()
    await db.refresh(workspace)

    return WorkspaceOut(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        description=workspace.description,
        owner_id=workspace.owner_id,
        created_at=workspace.created_at,
        role="owner",
    )


# ── Workspace Members ─────────────────────────────────────────────────────────

@router.get("/{workspace_id}/members")
async def list_workspace_members(
    workspace_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.VIEW)
    result = await db.execute(
        select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
    )
    members = result.scalars().all()
    return [
        {
            "id": m.id,
            "workspace_id": m.workspace_id,
            "user_id": m.user_id,
            "email": m.email,
            "role": m.role,
            "status": m.status,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in members
    ]


@router.post("/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
async def invite_workspace_member(
    workspace_id: str,
    payload: MemberCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.MANAGE_MEMBERS)
    email_clean = payload.email.lower().strip()

    # Check if already invited or member
    existing = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.email == email_clean,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This user is already a member or has a pending invite.")

    new_member = WorkspaceMember(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        user_id=None,
        email=email_clean,
        role=payload.role,
        status="active",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(new_member)
    await db.commit()
    await db.refresh(new_member)
    return {"id": new_member.id, "email": new_member.email, "role": new_member.role, "status": new_member.status}


@router.patch("/{workspace_id}/members/{member_id}")
async def update_workspace_member(
    workspace_id: str,
    member_id: str,
    payload: MemberUpdate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.MANAGE_MEMBERS)
    res = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
    )
    member = res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")

    member.role = payload.role
    await db.commit()
    return {"id": member.id, "role": member.role}


@router.delete("/{workspace_id}/members/{member_id}")
async def remove_workspace_member(
    workspace_id: str,
    member_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.MANAGE_MEMBERS)
    res = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
    )
    member = res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")

    await db.delete(member)
    await db.commit()
    return {"status": "removed"}


# ── Workspace APIs ────────────────────────────────────────────────────────────

@router.get("/{workspace_id}/apis")
async def list_workspace_apis(
    workspace_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.VIEW)
    result = await db.execute(
        select(WorkspaceApi).where(
            WorkspaceApi.workspace_id == workspace_id,
            WorkspaceApi.status == "active",
        ).order_by(desc(WorkspaceApi.created_at))
    )
    apis = result.scalars().all()
    return [
        {
            "id": a.id,
            "workspace_id": a.workspace_id,
            "name": a.name,
            "base_url": a.base_url,
            "environment": a.environment,
            "project_name": a.project_name,
            "category": a.category,
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in apis
    ]


@router.post("/{workspace_id}/apis", status_code=status.HTTP_201_CREATED)
async def register_workspace_api(
    workspace_id: str,
    payload: ApiCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.MANAGE_INTEGRATIONS)
    new_api = WorkspaceApi(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        name=payload.name.strip(),
        base_url=payload.base_url.strip(),
        environment=payload.environment,
        project_name=payload.project_name,
        category=payload.category,
        created_by=user.id,
    )
    db.add(new_api)
    await db.commit()
    await db.refresh(new_api)
    return {
        "id": new_api.id,
        "name": new_api.name,
        "base_url": new_api.base_url,
        "environment": new_api.environment,
        "project_name": new_api.project_name,
        "status": new_api.status,
    }


@router.patch("/{workspace_id}/apis/{api_id}")
async def update_workspace_api(
    workspace_id: str,
    api_id: str,
    payload: ApiUpdate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.MANAGE_INTEGRATIONS)
    res = await db.execute(
        select(WorkspaceApi).where(
            WorkspaceApi.id == api_id,
            WorkspaceApi.workspace_id == workspace_id,
        )
    )
    api_obj = res.scalar_one_or_none()
    if not api_obj:
        raise HTTPException(status_code=404, detail="API not found.")

    if payload.name is not None:
        api_obj.name = payload.name
    if payload.base_url is not None:
        api_obj.base_url = payload.base_url
    if payload.environment is not None:
        api_obj.environment = payload.environment
    if payload.project_name is not None:
        api_obj.project_name = payload.project_name
    if payload.category is not None:
        api_obj.category = payload.category
    if payload.status is not None:
        api_obj.status = payload.status

    await db.commit()
    return {"status": "updated", "id": api_obj.id}


@router.delete("/{workspace_id}/apis/{api_id}")
async def delete_workspace_api(
    workspace_id: str,
    api_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.MANAGE_INTEGRATIONS)
    res = await db.execute(
        select(WorkspaceApi).where(
            WorkspaceApi.id == api_id,
            WorkspaceApi.workspace_id == workspace_id,
        )
    )
    api_obj = res.scalar_one_or_none()
    if not api_obj:
        raise HTTPException(status_code=404, detail="API not found.")

    api_obj.status = "archived"
    await db.commit()
    return {"status": "archived"}


# ── Policies, Incidents & Notifications ───────────────────────────────────────

@router.get("/{workspace_id}/policies")
async def list_workspace_policies(
    workspace_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.VIEW)
    result = await db.execute(
        select(WorkspaceSecurityPolicy).where(WorkspaceSecurityPolicy.workspace_id == workspace_id)
    )
    policies = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "rule_type": p.rule_type,
            "configuration": p.configuration,
            "severity": p.severity,
            "enabled": p.enabled,
            "alert_on_violation": p.alert_on_violation,
        }
        for p in policies
    ]


@router.get("/{workspace_id}/incidents")
async def list_workspace_incidents(
    workspace_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_workspace_permission(workspace_id, user, Permission.VIEW)
    result = await db.execute(
        select(WorkspaceIncident).where(WorkspaceIncident.workspace_id == workspace_id).order_by(desc(WorkspaceIncident.created_at))
    )
    incidents = result.scalars().all()
    return [
        {
            "id": inc.id,
            "title": inc.title,
            "description": inc.description,
            "severity": inc.severity,
            "status": inc.status,
            "related_scan_id": inc.related_scan_id,
            "created_at": inc.created_at.isoformat() if inc.created_at else None,
        }
        for inc in incidents
    ]


@router.get("/{workspace_id}/notifications")
async def list_workspace_notifications(
    workspace_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkspaceNotification).where(
            WorkspaceNotification.workspace_id == workspace_id,
            WorkspaceNotification.user_id == user.id,
        ).order_by(desc(WorkspaceNotification.created_at))
    )
    notifs = result.scalars().all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "event_type": n.event_type,
            "read_at": n.read_at.isoformat() if n.read_at else None,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]


@router.post("/{workspace_id}/notifications/read")
async def mark_notifications_read(
    workspace_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkspaceNotification).where(
            WorkspaceNotification.workspace_id == workspace_id,
            WorkspaceNotification.user_id == user.id,
            WorkspaceNotification.read_at.is_(None),
        )
    )
    now = datetime.now(timezone.utc)
    for n in result.scalars().all():
        n.read_at = now
    await db.commit()
    return {"status": "ok"}
