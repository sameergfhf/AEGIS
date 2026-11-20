from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import UserContext, get_current_user_optional
from app.database import get_db
from app.models.finding import Finding
from app.models.scan import Scan
from app.models.scheduled_scan import ScheduledScan, ScheduledScanExecution
from app.models.workspace import WorkspaceApi, WorkspaceIncident
from app.security.workspace_authorization import Permission, require_workspace_permission

router = APIRouter(prefix="/workspaces", tags=["Workspace Analytics"])


@router.get("/{workspace_id}/analytics")
async def workspace_analytics(
    workspace_id: str,
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    project_id: str | None = None,
    api_id: str | None = None,
    severity: str | None = None,
    member_id: str | None = None,
    scan_status: str | None = None,
    user: UserContext | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    if not user:
        raise HTTPException(401, "Sign in to view workspace analytics.")
    await require_workspace_permission(workspace_id, user, Permission.VIEW)

    truncated_dimensions: list[str] = []

    # 1. APIs from Neon
    api_rows = (await db.execute(
        select(WorkspaceApi).where(WorkspaceApi.workspace_id == workspace_id).limit(1000)
    )).scalars().all()
    apis = [{"id": a.id, "project_id": a.project_name, "category": a.category, "environment": a.environment, "status": a.status} for a in api_rows]

    # 2. Scans from Neon
    scan_query = select(Scan).where(Scan.workspace_id == workspace_id)
    if date_from:
        scan_query = scan_query.where(Scan.started_at >= date_from)
    if date_to:
        scan_query = scan_query.where(Scan.started_at < date_to)
    if member_id:
        scan_query = scan_query.where(Scan.user_id == member_id)
    if scan_status:
        scan_query = scan_query.where(Scan.status == scan_status)
    scans = (await db.execute(scan_query.order_by(Scan.started_at.asc()).limit(1000))).scalars().all()

    # 3. Findings from Neon
    findings_query = select(Finding.severity).join(Scan, Finding.scan_id == Scan.id).where(Scan.workspace_id == workspace_id)
    if severity:
        findings_query = findings_query.where(Finding.severity.ilike(severity))
    if date_from:
        findings_query = findings_query.where(Finding.created_at >= date_from)
    if date_to:
        findings_query = findings_query.where(Finding.created_at < date_to)
    findings = [{"severity": item[0]} for item in (await db.execute(findings_query.limit(2000))).all()]

    # 4. Incidents from Neon
    incident_query = select(WorkspaceIncident).where(WorkspaceIncident.workspace_id == workspace_id)
    if date_from:
        incident_query = incident_query.where(WorkspaceIncident.created_at >= date_from)
    if date_to:
        incident_query = incident_query.where(WorkspaceIncident.created_at < date_to)
    incident_rows = (await db.execute(incident_query.limit(1000))).scalars().all()
    incidents = [{"id": i.id, "status": i.status, "severity": i.severity, "created_at": i.created_at.isoformat() if i.created_at else None, "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None} for i in incident_rows]

    evaluations: list[dict] = []
    approvals: list[dict] = []

    execution_query = select(ScheduledScanExecution).join(ScheduledScan, ScheduledScan.id == ScheduledScanExecution.schedule_id).where(ScheduledScan.workspace_id == workspace_id)
    if date_from:
        execution_query = execution_query.where(ScheduledScanExecution.started_at >= date_from)
    if date_to:
        execution_query = execution_query.where(ScheduledScanExecution.started_at < date_to)
    executions = (await db.execute(execution_query.order_by(ScheduledScanExecution.started_at.desc()).limit(1000))).scalars().all()

    severity_counts = Counter(f["severity"].lower() for f in findings if f.get("severity"))
    coverage_values = [s.assessment_coverage for s in scans if s.assessment_coverage is not None]
    scores = [s.assessment_score for s in scans if s.assessment_score is not None]

    outcomes = Counter(e.get("outcome") for e in evaluations if e.get("outcome"))
    eval_total = sum(outcomes.values())
    policy_compliance_rate = round((outcomes["compliant"] / eval_total) * 100, 1) if eval_total else None

    # Trend grouped by date
    timeline_map: dict[str, dict[str, Any]] = defaultdict(lambda: {"scans": 0, "scores": [], "findings": 0})
    for s in scans:
        if s.started_at:
            bucket = s.started_at.strftime("%Y-%m-%d")
            timeline_map[bucket]["scans"] += 1
            if s.assessment_score is not None:
                timeline_map[bucket]["scores"].append(s.assessment_score)
    timeline = [
        {
            "date": day,
            "scans": data["scans"],
            "avg_score": round(sum(data["scores"]) / len(data["scores"]), 1) if data["scores"] else None,
            "findings": data["findings"],
        }
        for day, data in sorted(timeline_map.items())
    ]

    total_execs = len(executions)
    failed_execs = sum(1 for e in executions if e.status == "failed")
    reliability_rate = round(((total_execs - failed_execs) / total_execs) * 100, 1) if total_execs else None

    return {
        "summary": {
            "total_scans": len(scans),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "avg_coverage": round(sum(coverage_values) / len(coverage_values), 1) if coverage_values else None,
            "total_apis": len(apis),
            "open_incidents": sum(1 for inc in incidents if inc.get("status") in {"open", "investigating"}),
            "policy_compliance_rate": policy_compliance_rate,
            "schedule_reliability_rate": reliability_rate,
        },
        "severity_distribution": dict(severity_counts),
        "timeline": timeline,
        "api_environment_distribution": dict(Counter(a.get("environment") or "development" for a in apis)),
        "truncated_dimensions": truncated_dimensions,
    }
