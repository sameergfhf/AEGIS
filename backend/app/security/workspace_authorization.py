"""Workspace membership lookup and centralized permission checks."""
from __future__ import annotations

from enum import Enum
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from app.api.auth import UserContext
from app.config import get_settings
from app.models.scan import Scan
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


class Permission(str, Enum):
    VIEW = "workspace.view"
    RUN_SCAN = "scan.run"
    MANAGE_MEMBERS = "members.manage"
    MANAGE_POLICIES = "policies.manage"
    ACCEPT_RISK = "risk.accept"
    APPROVE = "approvals.decide"
    MANAGE_INTEGRATIONS = "integrations.manage"
    EXPORT_REPORTS = "reports.export"
    VIEW_AUDIT = "audit.view"
    MANAGE_WORKSPACE = "workspace.manage"


# Existing Supabase rows use owner/admin/member. "member" maps to the initial
# Security Analyst capability set until workspace-specific roles are migrated.
ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    "owner": frozenset(Permission),
    "admin": frozenset({
        Permission.VIEW, Permission.RUN_SCAN, Permission.MANAGE_MEMBERS,
        Permission.MANAGE_POLICIES, Permission.ACCEPT_RISK, Permission.APPROVE,
        Permission.MANAGE_INTEGRATIONS, Permission.EXPORT_REPORTS,
        Permission.VIEW_AUDIT, Permission.MANAGE_WORKSPACE,
    }),
    "security_analyst": frozenset({
        Permission.VIEW, Permission.RUN_SCAN, Permission.ACCEPT_RISK,
        Permission.EXPORT_REPORTS,
    }),
    "member": frozenset({Permission.VIEW, Permission.RUN_SCAN, Permission.EXPORT_REPORTS}),
    "developer": frozenset({Permission.VIEW, Permission.RUN_SCAN}),
    "auditor": frozenset({Permission.VIEW, Permission.EXPORT_REPORTS, Permission.VIEW_AUDIT}),
    "viewer": frozenset({Permission.VIEW}),
}


async def workspace_role(workspace_id: str, user: UserContext) -> str:
    """Resolve owner or active member role through Supabase RLS using the user's JWT."""
    try:
        normalized_workspace_id = str(UUID(workspace_id))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=404, detail="Workspace not found.") from exc

    settings = get_settings()
    base_url = (settings.supabase_auth_url or settings.supabase_url).rstrip("/")
    api_key = settings.supabase_auth_anon_key
    if not base_url or not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Workspace authorization is not configured on this API server.",
        )
    if not user.access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required.")

    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {user.access_token}",
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
            workspace_response = await client.get(
                f"{base_url}/rest/v1/workspaces",
                params={"id": f"eq.{normalized_workspace_id}", "select": "id,owner_id"},
                headers=headers,
            )
            workspace_response.raise_for_status()
            rows = workspace_response.json()
            if not isinstance(rows, list) or not rows:
                raise HTTPException(status_code=404, detail="Workspace not found.")
            if rows[0].get("owner_id") == user.id:
                return "owner"

            member_response = await client.get(
                f"{base_url}/rest/v1/workspace_members",
                params={
                    "workspace_id": f"eq.{normalized_workspace_id}",
                    "user_id": f"eq.{user.id}",
                    "status": "eq.active",
                    "select": "role",
                },
                headers=headers,
            )
            member_response.raise_for_status()
            members = member_response.json()
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not verify workspace membership with Supabase.",
        ) from exc

    if not isinstance(members, list) or not members:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not an active workspace member.")
    role = members[0].get("role")
    if role not in ROLE_PERMISSIONS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace role is not recognized.")
    return role


async def require_workspace_permission(
    workspace_id: str,
    user: UserContext,
    permission: Permission,
) -> str:
    role = await workspace_role(workspace_id, user)
    if permission not in ROLE_PERMISSIONS[role]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your workspace role cannot perform this action.")
    return role


async def get_authorized_scan(
    scan_id: str,
    db: AsyncSession,
    user: UserContext | None,
    *,
    write: bool = False,
) -> Scan:
    """Load a scan only when the caller owns it or belongs to its workspace.

    An unowned, non-workspace guest scan uses its random UUID as a bearer
    capability, preserving the existing guest results and refinement workflow.
    Workspace and authenticated personal scans always require identity checks.
    """
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")

    if scan.workspace_id:
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required for workspace scans.")
        await require_workspace_permission(
            scan.workspace_id,
            user,
            Permission.RUN_SCAN if write else Permission.VIEW,
        )
        return scan

    if scan.user_id:
        if user is None or scan.user_id != user.id:
            raise HTTPException(status_code=404, detail="Scan not found.")
        return scan

    return scan
