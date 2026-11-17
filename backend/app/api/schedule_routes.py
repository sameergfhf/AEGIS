from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
import httpx
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import UserContext, get_current_user_optional
from app.database import get_db
from app.models.scan import Scan
from app.models.scheduled_scan import ScheduledScan, ScheduledScanExecution
from app.security.url_validation import URLValidationError, resolve_and_validate
from app.security.workspace_authorization import Permission, require_workspace_permission
from app.services.schedule_service import has_capacity, next_occurrence, start_execution

router = APIRouter(prefix="/scheduled-scans", tags=["Scheduled Scans"])


class ScheduleCreate(BaseModel):
    workspace_id: str
    api_id: str
    name: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=8, max_length=2048)
    cadence: Literal["daily", "weekly", "interval"]
    timezone_name: str = Field(default="UTC", max_length=64)
    local_time: str = Field(default="02:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    weekday: int | None = Field(default=None, ge=0, le=6)
    interval_minutes: int | None = Field(default=None, ge=15, le=10080)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Schedule name cannot be blank.")
        return value


@router.post("")
async def create_schedule(
    body: ScheduleCreate,
    user: UserContext | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(401, "Sign in to create a scheduled scan.")
    await require_workspace_permission(body.workspace_id, user, Permission.RUN_SCAN)
    if body.cadence == "interval" and body.interval_minutes is None:
        raise HTTPException(422, "Interval schedules require interval_minutes between 15 and 10080.")
    if body.cadence == "weekly" and body.weekday is None:
        raise HTTPException(422, "Weekly schedules require weekday (Monday=0 through Sunday=6).")
    try:
        ZoneInfo(body.timezone_name)
        target, _ = resolve_and_validate(body.url)
    except (ZoneInfoNotFoundError, URLValidationError) as exc:
        raise HTTPException(422, str(exc)) from exc
    from app.config import get_settings
    config = get_settings()
    api_base = (config.supabase_auth_url or config.supabase_url).rstrip("/")
    if not api_base or not config.supabase_auth_anon_key:
        raise HTTPException(503, "Workspace API inventory is not configured on this API server.")
    async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
        api_response = await client.get(
            f"{api_base}/rest/v1/workspace_apis",
            params={"id": f"eq.{body.api_id}", "workspace_id": f"eq.{body.workspace_id}", "status": "eq.active", "select": "base_url"},
            headers={"apikey": config.supabase_auth_anon_key, "Authorization": f"Bearer {user.access_token}"},
        )
        if api_response.status_code >= 400 or not api_response.json():
            raise HTTPException(422, "Select an active API registered in this workspace.")
        base = api_response.json()[0].get("base_url") or ""
    target_parts, base_parts = urlparse(target), urlparse(base)
    if (target_parts.scheme, target_parts.hostname, target_parts.port) != (base_parts.scheme, base_parts.hostname, base_parts.port):
        raise HTTPException(422, "Scheduled scan URL must use the registered API origin.")
    schedule = ScheduledScan(
        id=str(uuid.uuid4()), workspace_id=body.workspace_id, api_id=body.api_id, created_by=user.id,
        name=body.name, url=target, cadence=body.cadence, timezone_name=body.timezone_name,
        local_time=body.local_time, weekday=body.weekday, interval_minutes=body.interval_minutes,
        enabled=True, next_run_at=datetime.now(timezone.utc),
    )
    schedule.next_run_at = next_occurrence(schedule, datetime.now(timezone.utc))
    db.add(schedule)
    await db.commit()
    return {"id": schedule.id, "workspace_id": schedule.workspace_id, "api_id": schedule.api_id, "name": schedule.name,
            "url": schedule.url, "cadence": schedule.cadence, "timezone": schedule.timezone_name,
            "enabled": schedule.enabled, "next_run_at": schedule.next_run_at}


@router.get("")
async def list_schedules(
    workspace_id: str,
    user: UserContext | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(401, "Sign in to view scheduled scans.")
    await require_workspace_permission(workspace_id, user, Permission.VIEW)
    rows = (await db.execute(select(ScheduledScan).where(ScheduledScan.workspace_id == workspace_id).order_by(ScheduledScan.created_at.desc()))).scalars().all()
    return [{"id": row.id, "api_id": row.api_id, "name": row.name, "url": row.url, "cadence": row.cadence,
             "timezone": row.timezone_name, "local_time": row.local_time, "weekday": row.weekday,
             "interval_minutes": row.interval_minutes, "enabled": row.enabled,
             "next_run_at": row.next_run_at, "last_run_at": row.last_run_at} for row in rows]


@router.patch("/{schedule_id}")
async def set_schedule_enabled(
    schedule_id: str,
    enabled: bool,
    user: UserContext | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(401, "Sign in to manage scheduled scans.")
    row = (await db.execute(select(ScheduledScan).where(ScheduledScan.id == schedule_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Scheduled scan not found.")
    await require_workspace_permission(row.workspace_id, user, Permission.RUN_SCAN)
    row.enabled = enabled
    if not enabled:
        row.lease_until = None
    await db.commit()
    return {"id": row.id, "enabled": row.enabled}


@router.get("/{schedule_id}/executions")
async def list_executions(
    schedule_id: str,
    user: UserContext | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(401, "Sign in to view scheduled scan history.")
    row = (await db.execute(select(ScheduledScan).where(ScheduledScan.id == schedule_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Scheduled scan not found.")
    await require_workspace_permission(row.workspace_id, user, Permission.VIEW)
    runs = (await db.execute(select(ScheduledScanExecution).where(ScheduledScanExecution.schedule_id == schedule_id).order_by(ScheduledScanExecution.started_at.desc()).limit(100))).scalars().all()
    return [{"id": run.id, "scan_id": run.scan_id, "scheduled_for": run.scheduled_for,
             "status": run.status, "attempts": run.attempts, "error": run.error,
             "started_at": run.started_at, "finished_at": run.finished_at} for run in runs]


@router.post("/{schedule_id}/run")
async def run_schedule_now(
    schedule_id: str,
    user: UserContext | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(401, "Sign in to run a scheduled scan.")
    if not has_capacity():
        raise HTTPException(429, "Scheduled scan concurrency limit reached. Try again shortly.")
    row = (await db.execute(select(ScheduledScan).where(ScheduledScan.id == schedule_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Scheduled scan not found.")
    await require_workspace_permission(row.workspace_id, user, Permission.RUN_SCAN)
    running = await db.execute(select(ScheduledScanExecution.id).where(
        ScheduledScanExecution.schedule_id == row.id,
        ScheduledScanExecution.status == "running",
    ).limit(1))
    if running.scalar_one_or_none():
        raise HTTPException(409, "A scan for this schedule is already running.")
    from urllib.parse import urlparse
    scan_id, execution_id = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    db.add(Scan(id=scan_id, url=row.url, hostname=urlparse(row.url).hostname or row.url,
                status="pending", user_id=user.id, workspace_id=row.workspace_id))
    db.add(ScheduledScanExecution(id=execution_id, schedule_id=row.id, scan_id=scan_id,
                                  scheduled_for=now, status="running", attempts=1))
    await db.commit()
    try:
        start_execution(row.id, execution_id, scan_id)
    except RuntimeError as exc:
        raise HTTPException(429, str(exc)) from exc
    return {"execution_id": execution_id, "scan_id": scan_id, "status": "running"}
