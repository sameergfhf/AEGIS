from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import UserContext, get_current_user_optional
from app.config import get_settings
from app.security.workspace_authorization import Permission, require_workspace_permission
from app.database import get_db
from app.models.scheduled_scan import ScheduledScan, ScheduledScanExecution
from app.models.scan import Scan
from app.models.finding import Finding

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
    settings = get_settings()
    base = (settings.supabase_auth_url or settings.supabase_url).rstrip("/")
    if not base or not settings.supabase_auth_anon_key or not user.access_token:
        raise HTTPException(503, "Workspace analytics is not configured on this API server.")
    headers = {"apikey": settings.supabase_auth_anon_key, "Authorization": f"Bearer {user.access_token}", "Accept": "application/json"}
    truncated_dimensions: list[str] = []
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=False) as client:
        async def get_rows(path: str, params: dict[str, str]):
            response = await client.get(f"{base}/rest/v1/{path}", params=params, headers=headers)
            if response.status_code >= 400:
                raise HTTPException(502, "Workspace analytics data could not be loaded.")
            rows = response.json()
            content_range = response.headers.get("content-range", "")
            try:
                total = content_range.rsplit("/", 1)[1]
                if total != "*" and int(total) > len(rows):
                    truncated_dimensions.append(path)
            except (IndexError, ValueError):
                pass
            return rows

        apis = await get_rows("workspace_apis", {"workspace_id": f"eq.{workspace_id}", "select": "id,project_id,category,environment,status", "limit": "1000"})
        # Scan records/findings are owned by the backend SQL database, the same
        # source used by scan details, reports, personal history, and schedules.
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
        findings_query = select(Finding.severity).join(Scan, Finding.scan_id == Scan.id).where(Scan.workspace_id == workspace_id)
        if severity:
            findings_query = findings_query.where(Finding.severity.ilike(severity))
        if date_from:
            findings_query = findings_query.where(Finding.created_at >= date_from)
        if date_to:
            findings_query = findings_query.where(Finding.created_at < date_to)
        findings = [{"severity": item[0]} for item in (await db.execute(findings_query.limit(2000))).all()]
        incidents_params = {"workspace_id": f"eq.{workspace_id}", "select": "id,status,severity,created_at,resolved_at,due_at", "limit": "1000"}
        incident_date_terms = []
        if date_from:
            incident_date_terms.append(f"created_at.gte.{date_from.astimezone(timezone.utc).isoformat()}")
        if date_to:
            incident_date_terms.append(f"created_at.lt.{date_to.astimezone(timezone.utc).isoformat()}")
        if incident_date_terms:
            incidents_params["and"] = f"({','.join(incident_date_terms)})"
        incidents = await get_rows("workspace_incidents", incidents_params)
        evaluation_params = {"workspace_id": f"eq.{workspace_id}", "select": "outcome,evaluated_at", "limit": "2000"}
        if date_from:
            evaluation_params["evaluated_at"] = f"gte.{date_from.astimezone(timezone.utc).isoformat()}"
        if date_to:
            evaluation_params["and"] = f"(evaluated_at.lt.{date_to.astimezone(timezone.utc).isoformat()})"
        evaluations = await get_rows("workspace_policy_evaluations", evaluation_params)
        approvals = await get_rows("workspace_approvals", {"workspace_id": f"eq.{workspace_id}", "request_type": "eq.risk_acceptance", "select": "id,status,expires_at", "limit": "1000"})

    execution_query = select(ScheduledScanExecution).join(ScheduledScan, ScheduledScan.id == ScheduledScanExecution.schedule_id).where(ScheduledScan.workspace_id == workspace_id)
    if date_from:
        execution_query = execution_query.where(ScheduledScanExecution.started_at >= date_from)
    if date_to:
        execution_query = execution_query.where(ScheduledScanExecution.started_at < date_to)
    executions = (await db.execute(execution_query)).scalars().all()

    completed = [row for row in scans if row.status == "completed"]
    scores = [float(row.assessment_score) for row in completed if row.assessment_score is not None]
    coverages = [float(row.assessment_coverage) for row in completed if row.assessment_coverage is not None]
    trends: dict[str, dict[str, list[float]]] = defaultdict(lambda: {"score": [], "coverage": []})
    for row in completed:
        if row.started_at:
            day = row.started_at.date().isoformat()
            if row.assessment_score is not None:
                trends[day]["score"].append(float(row.assessment_score))
            if row.assessment_coverage is not None:
                trends[day]["coverage"].append(float(row.assessment_coverage))
    now = datetime.now(timezone.utc)
    unresolved = [incident for incident in incidents if incident.get("status") not in {"resolved", "closed"}]
    overdue = [incident for incident in unresolved if incident.get("due_at") and datetime.fromisoformat(incident["due_at"].replace("Z", "+00:00")) < now]
    resolution_hours = []
    for incident in incidents:
        if incident.get("resolved_at"):
            created = datetime.fromisoformat(incident["created_at"].replace("Z", "+00:00"))
            resolved = datetime.fromisoformat(incident["resolved_at"].replace("Z", "+00:00"))
            resolution_hours.append(max(0.0, (resolved-created).total_seconds()/3600))
    outcomes = Counter(evaluation.get("outcome") for evaluation in evaluations)
    assessed = outcomes["compliant"] + outcomes["non_compliant"]
    return {
        "apis": {"total": len(apis), "by_category": dict(Counter(api.get("category") or "uncategorized" for api in apis)), "by_environment": dict(Counter(api.get("environment") or "unknown" for api in apis))},
        "scans": {"total": len(scans), "completed": len(completed), "failed": sum(row.status == "failed" for row in scans), "average_score": sum(scores)/len(scores) if scores else None, "average_coverage": sum(coverages)/len(coverages) if coverages else None, "trend": [{"date": day, "average_score": sum(values["score"])/len(values["score"]) if values["score"] else None, "average_coverage": sum(values["coverage"])/len(values["coverage"]) if values["coverage"] else None, "scans": max(len(values["score"]), len(values["coverage"]))} for day, values in sorted(trends.items())]},
        "findings": {"total": len(findings), "by_severity": dict(Counter(item.get("severity", "unknown") for item in findings))},
        "incidents": {"open": len(unresolved), "overdue": len(overdue), "mean_time_to_remediate_hours": sum(resolution_hours)/len(resolution_hours) if resolution_hours else None},
        "policy": {"evaluations": sum(outcomes.values()), "compliant": outcomes["compliant"], "non_compliant": outcomes["non_compliant"], "inconclusive": outcomes["inconclusive"], "compliance_rate": outcomes["compliant"]/assessed if assessed else None},
        "automation": {"scheduled_runs": len(executions), "success_rate": sum(item.status == "completed" for item in executions)/len(executions) if executions else None},
        "risk_acceptances": {"total": len(approvals), "approved": sum(item.get("status") == "approved" and (not item.get("expires_at") or datetime.fromisoformat(item["expires_at"].replace("Z", "+00:00")) > now) for item in approvals), "pending": sum(item.get("status") == "pending" for item in approvals)},
        "filters": {"date_from": date_from, "date_to": date_to, "project_id": project_id, "api_id": api_id, "severity": severity, "member_id": member_id, "scan_status": scan_status, "inventory_association_available": False},
        "data_limitations": ["Scan rows are not yet linked to API/project inventory IDs; project/API filters do not change scan aggregates.", "Coverage is shown with score trends; empty values remain null rather than being reported as zero.", *( [f"Results are truncated by bounded query size for: {', '.join(truncated_dimensions)}."] if truncated_dimensions else [] )],
    }
