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


# Role capability mappings. "member" maps to the initial
# Security Analyst capability set.
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
    """Resolve owner or active member role directly from Neon PostgreSQL."""
    try:
        normalized_workspace_id = str(UUID(workspace_id))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=404, detail="Workspace not found.") from exc

    from app.database import AsyncSessionLocal
    from app.models.workspace import Workspace, WorkspaceMember

    async with AsyncSessionLocal() as session:
        # Check workspace and ownership
        ws_res = await session.execute(select(Workspace).where(Workspace.id == normalized_workspace_id))
        ws = ws_res.scalar_one_or_none()
        if not ws:
            raise HTTPException(status_code=404, detail="Workspace not found.")
        if ws.owner_id == user.id:
            return "owner"

        # Check membership
        mem_res = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == normalized_workspace_id,
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.status == "active",
            )
        )
        member = mem_res.scalar_one_or_none()
        if not member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not an active workspace member.")
        if member.role not in ROLE_PERMISSIONS:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace role is not recognized.")
        return member.role


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
