"""Persistent lease-based scheduler for workspace full scans.

The database is the schedule source of truth. Atomic lease updates prevent two
workers sharing the same database from claiming one occurrence at once.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import or_, select, update

from app.database import AsyncSessionLocal
from app.models.scan import Scan
from app.models.scheduled_scan import ScheduledScan, ScheduledScanExecution
from app.services.scan_service import run_scan
from app.services.schedule_logic import next_occurrence

logger = logging.getLogger(__name__)
_active: set[asyncio.Task] = set()


async def _execute(schedule_id: str, execution_id: str, scan_id: str) -> None:
    try:
        async with AsyncSessionLocal() as db:
            row = (await db.execute(select(ScheduledScan).where(ScheduledScan.id == schedule_id))).scalar_one_or_none()
            scan = (await db.execute(select(Scan).where(Scan.id == scan_id))).scalar_one_or_none()
            if not row or not scan:
                return
            from app.models.workspace import WorkspaceApi
            from urllib.parse import urlparse
            api_row = (await db.execute(select(WorkspaceApi).where(WorkspaceApi.id == row.api_id, WorkspaceApi.workspace_id == row.workspace_id))).scalar_one_or_none()
            if not api_row or api_row.status != "active":
                raise RuntimeError("The registered API is no longer active.")
            scheduled_origin = urlparse(row.url)
            api_origin = urlparse(api_row.base_url)
            if (scheduled_origin.scheme, scheduled_origin.hostname, scheduled_origin.port) != (api_origin.scheme, api_origin.hostname, api_origin.port):
                raise RuntimeError("The scheduled target no longer matches the registered API origin.")
                workspace = await client.get(f"{base_url}/rest/v1/workspaces", params={"id": f"eq.{row.workspace_id}", "select": "owner_id"}, headers=headers)
                workspace.raise_for_status()
                workspace_rows = workspace.json()
                owner_active = bool(workspace_rows and workspace_rows[0].get("owner_id") == row.created_by)
                if not owner_active:
                    membership = await client.get(f"{base_url}/rest/v1/workspace_members", params={"workspace_id": f"eq.{row.workspace_id}", "user_id": f"eq.{row.created_by}", "status": "eq.active", "select": "role"}, headers=headers)
                    membership.raise_for_status()
                    from app.security.workspace_authorization import Permission, ROLE_PERMISSIONS
                    rows = membership.json()
                    if not rows or Permission.RUN_SCAN not in ROLE_PERMISSIONS.get(rows[0].get("role"), frozenset()):
                        raise RuntimeError("The schedule creator no longer has permission to run workspace scans.")
            # Revalidate at execution time; targets can change DNS after scheduling.
            from app.security.url_validation import resolve_and_validate
            target, _ = resolve_and_validate(row.url)
            await db.commit()
            await run_scan(scan_id, target, db)
            current = (await db.execute(select(Scan).where(Scan.id == scan_id))).scalar_one_or_none()
            execution = (await db.execute(select(ScheduledScanExecution).where(ScheduledScanExecution.id == execution_id))).scalar_one_or_none()
            schedule = (await db.execute(select(ScheduledScan).where(ScheduledScan.id == schedule_id))).scalar_one_or_none()
            if execution and current:
                if current.status == "failed" and execution.attempts < 3 and schedule and schedule.enabled:
                    execution.attempts += 1
                    execution.error = current.error_message
                    execution.status = "running"
                    execution.finished_at = None
                    retry_scan_id = str(uuid.uuid4())
                    execution.scan_id = retry_scan_id
                    from urllib.parse import urlparse
                    db.add(Scan(id=retry_scan_id, url=schedule.url, hostname=urlparse(schedule.url).hostname or schedule.url,
                                status="pending", user_id=schedule.created_by, workspace_id=schedule.workspace_id))
                    schedule.lease_until = datetime.now(timezone.utc) + timedelta(minutes=20)
                    retry_delay = 30 * (2 ** (execution.attempts - 2))
                    await db.commit()
                    await asyncio.sleep(retry_delay)
                    start_execution(schedule_id, execution_id, retry_scan_id)
                    return
                execution.status = current.status
                execution.error = current.error_message
                execution.finished_at = datetime.now(timezone.utc)
            if schedule:
                schedule.last_run_at = datetime.now(timezone.utc)
                schedule.lease_until = None
            await db.commit()
    except Exception as exc:
        logger.exception("Scheduled scan execution failed")
        async with AsyncSessionLocal() as db:
            execution = (await db.execute(select(ScheduledScanExecution).where(ScheduledScanExecution.id == execution_id))).scalar_one_or_none()
            schedule = (await db.execute(select(ScheduledScan).where(ScheduledScan.id == schedule_id))).scalar_one_or_none()
            now = datetime.now(timezone.utc)
            scan = (await db.execute(select(Scan).where(Scan.id == scan_id))).scalar_one_or_none()
            if scan and scan.status not in {"completed", "failed"}:
                scan.status = "failed"
                scan.error_message = str(exc)[:2000]
                scan.completed_at = now
            if execution:
                execution.status = "failed"
                execution.error = str(exc)[:2000]
                execution.finished_at = now
            if schedule:
                schedule.last_run_at = now
                schedule.lease_until = None
            await db.commit()


async def _claim_one(now: datetime) -> tuple[str, str, str] | None:
    async with AsyncSessionLocal() as db:
        candidates = (await db.execute(select(ScheduledScan).where(
            ScheduledScan.enabled.is_(True),
            or_(ScheduledScan.next_run_at <= now, ScheduledScan.lease_until <= now),
        ).order_by(ScheduledScan.next_run_at).limit(10))).scalars().all()
        for candidate in candidates:
            old_lease = candidate.lease_until
            claimed = await db.execute(update(ScheduledScan).where(
                ScheduledScan.id == candidate.id,
                ScheduledScan.enabled.is_(True),
                or_(ScheduledScan.next_run_at <= now, ScheduledScan.lease_until <= now),
            ).values(lease_until=now + timedelta(minutes=20)))
            if claimed.rowcount != 1:
                continue
            running = (await db.execute(select(ScheduledScanExecution).where(
                ScheduledScanExecution.schedule_id == candidate.id,
                ScheduledScanExecution.status == "running",
            ).order_by(ScheduledScanExecution.started_at.desc()).limit(1))).scalar_one_or_none() if old_lease else None
            if running and running.attempts < 3:
                running.attempts += 1
                await db.commit()
                return candidate.id, running.id, running.scan_id
            if running:
                running.status = "failed"
                running.error = "Retry limit reached after the scheduler lease expired."
                running.finished_at = now
            scheduled_for = candidate.next_run_at
            execution_id, scan_id = str(uuid.uuid4()), str(uuid.uuid4())
            schedule = candidate
            schedule.next_run_at = next_occurrence(schedule, scheduled_for)
            execution = ScheduledScanExecution(
                id=execution_id, schedule_id=schedule.id, scan_id=scan_id,
                scheduled_for=scheduled_for, status="running", attempts=1,
            )
            from urllib.parse import urlparse
            parsed = urlparse(schedule.url)
            db.add(Scan(id=scan_id, url=schedule.url, hostname=parsed.hostname or schedule.url,
                        status="pending", user_id=schedule.created_by, workspace_id=schedule.workspace_id))
            db.add(execution)
            await db.commit()
            return schedule.id, execution_id, scan_id
        return None


async def scheduler_loop() -> None:
    while True:
        try:
            now = datetime.now(timezone.utc)
            while len(_active) < 10:
                claim = await _claim_one(now)
                if not claim:
                    break
                start_execution(*claim)
        except Exception:
            logger.exception("Persistent schedule polling failed")
        await asyncio.sleep(15)


def has_capacity() -> bool:
    return len(_active) < 10


def start_execution(schedule_id: str, execution_id: str, scan_id: str) -> None:
    if not has_capacity():
        raise RuntimeError("The scheduled scan concurrency limit has been reached.")
    task = asyncio.create_task(_execute(schedule_id, execution_id, scan_id))
    _active.add(task)
    task.add_done_callback(_active.discard)


async def stop_active_executions() -> None:
    tasks = list(_active)
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
