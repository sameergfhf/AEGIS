"""Evidence-based policy evaluation and finding-to-incident automation using Neon Postgres."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
import uuid

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.workspace import (
    Workspace,
    WorkspaceMember,
    WorkspaceSecurityPolicy,
    WorkspaceIncident,
    WorkspaceNotification,
)
from app.models.scan import Scan

logger = logging.getLogger(__name__)


async def notify_scan_failure(workspace_id: str | None, user_id: str | None, scan_id: str) -> None:
    if not workspace_id or not user_id:
        return
    try:
        async with AsyncSessionLocal() as session:
            # Gather recipients: owner + members
            recipients = {user_id}
            ws_res = await session.execute(select(Workspace.owner_id).where(Workspace.id == workspace_id))
            owner_id = ws_res.scalar_one_or_none()
            if owner_id:
                recipients.add(owner_id)
            members_res = await session.execute(
                select(WorkspaceMember.user_id).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                )
            )
            for m_uid in members_res.scalars().all():
                if m_uid:
                    recipients.add(m_uid)

            for rec in recipients:
                notif = WorkspaceNotification(
                    id=str(uuid.uuid4()),
                    workspace_id=workspace_id,
                    user_id=rec,
                    event_type="scan.failed",
                    title="Workspace scan failed",
                    body="A scan failed before producing an assessment. Review the scan record for status.",
                    resource_id=scan_id,
                )
                session.add(notif)
            await session.commit()
    except Exception as exc:
        logger.warning("Scan failure notification could not be stored in Neon: %s", exc)


def _checks(result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for module in (result.get("test_results") or {}).values():
        for finding in module.get("findings") or []:
            name = str(finding.get("check") or finding.get("name") or "").lower()
            if name:
                found[name] = finding
    return found


def evaluate_policy(policy: WorkspaceSecurityPolicy, scan: dict[str, Any]) -> dict[str, Any]:
    """Return a conservative outcome; absent evidence is never a pass."""
    kind = policy.rule_type
    config = policy.configuration or {}
    result_json = scan.get("result_json") or {}
    if isinstance(result_json, str):
        try:
            result_json = json.loads(result_json)
        except Exception:
            result_json = {}
    test_results = result_json.get("test_results") or {}
    findings_by_name = _checks(result_json)
    outcome = "compliant"
    why = ""

    if kind == "https_required":
        target = str(scan.get("url") or scan.get("target_url") or "")
        parsed = urlparse(target)
        if parsed.scheme.lower() != "https":
            outcome = "non_compliant"
            why = "Endpoint does not use HTTPS scheme."

    elif kind == "minimum_tls":
        tls_finding = findings_by_name.get("tls_version") or findings_by_name.get("tls version")
        evidence = str(tls_finding.get("evidence") or "") if tls_finding else ""
        required = str(config.get("minimum_version", "1.3"))
        if required == "1.3" and "TLSv1.3" not in evidence:
            outcome = "non_compliant"
            why = f"TLS 1.3 is required by workspace policy; detected: {evidence or 'TLS < 1.3'}."

    elif kind == "hsts_required":
        hsts = findings_by_name.get("strict-transport-security") or findings_by_name.get("hsts")
        if not hsts or hsts.get("status") != "pass":
            outcome = "non_compliant"
            why = "Strict-Transport-Security header is missing or misconfigured."

    elif kind == "csp_required":
        csp = findings_by_name.get("content-security-policy") or findings_by_name.get("csp")
        if not csp or csp.get("status") != "pass":
            outcome = "non_compliant"
            why = "Content-Security-Policy header is missing or non-compliant."

    elif kind == "content_type_options_required":
        cto = findings_by_name.get("x-content-type-options")
        if not cto or cto.get("status") != "pass":
            outcome = "non_compliant"
            why = "X-Content-Type-Options: nosniff header is missing."

    elif kind == "minimum_score":
        threshold = float(config.get("threshold", 80.0))
        score = scan.get("score")
        if score is None or float(score) < threshold:
            outcome = "non_compliant"
            why = f"Assessment score {score if score is not None else 'N/A'} is below required threshold {threshold}."

    elif kind == "minimum_coverage":
        min_cov = float(config.get("threshold", 75.0))
        cov = scan.get("assessment_coverage")
        if cov is None or float(cov) < min_cov:
            outcome = "non_compliant"
            why = f"Assessment coverage {cov if cov is not None else 'N/A'}% is below required {min_cov}%."

    elif kind == "maximum_critical_findings":
        limit = int(config.get("limit", 0))
        criticals = sum(1 for f in scan.get("findings", []) if str(f.get("severity", "")).lower() == "critical")
        if criticals > limit:
            outcome = "non_compliant"
            why = f"Detected {criticals} critical findings (policy allows maximum {limit})."

    elif kind == "scan_frequency_days":
        max_days = float(config.get("days", 30))
        days = scan.get("days_since_previous_scan")
        if days is not None and days > max_days:
            outcome = "non_compliant"
            why = f"{days:.1f} days elapsed since previous scan (policy limit: {max_days:.0f} days)."

    return {"outcome": outcome, "reason": why[:2000], "evidence": {"policy_type": kind, "scan_id": scan.get("id")}}


async def process_workspace_scan(scan: dict[str, Any], findings: list[dict[str, Any]]) -> None:
    """Evaluate policies and record notifications and incidents in Neon."""
    workspace_id, user_id = scan.get("workspace_id"), scan.get("user_id")
    if not workspace_id or not user_id:
        return

    try:
        async with AsyncSessionLocal() as session:
            # 1. Fetch active policies for this workspace
            policies_res = await session.execute(
                select(WorkspaceSecurityPolicy).where(
                    WorkspaceSecurityPolicy.workspace_id == workspace_id,
                    WorkspaceSecurityPolicy.enabled == True,
                )
            )
            policies = policies_res.scalars().all()

            # 2. Evaluate policies
            for policy in policies:
                evaluation = evaluate_policy(policy, {**scan, "findings": findings})
                if evaluation["outcome"] == "non_compliant" and policy.alert_on_violation:
                    notif = WorkspaceNotification(
                        id=str(uuid.uuid4()),
                        workspace_id=workspace_id,
                        user_id=user_id,
                        event_type="policy.violation",
                        title=f"Policy violation: {policy.name}",
                        body=evaluation["reason"],
                        resource_id=policy.id,
                    )
                    session.add(notif)

            # 3. Create incidents for High/Critical findings
            for finding in findings:
                severity = str(finding.get("severity", "")).lower()
                if severity in {"high", "critical"}:
                    title = finding.get("title", "High/Critical Vulnerability")
                    # Check for existing open incident for same scan & title
                    existing = await session.execute(
                        select(WorkspaceIncident).where(
                            WorkspaceIncident.workspace_id == workspace_id,
                            WorkspaceIncident.related_scan_id == scan["id"],
                            WorkspaceIncident.title == title,
                        )
                    )
                    if not existing.scalar_one_or_none():
                        incident = WorkspaceIncident(
                            id=str(uuid.uuid4()),
                            workspace_id=workspace_id,
                            related_scan_id=scan["id"],
                            title=title,
                            description=finding.get("description") or finding.get("evidence"),
                            severity=severity,
                            status="open",
                            created_by=user_id,
                        )
                        session.add(incident)

            await session.commit()
    except Exception as exc:
        logger.warning("Workspace scan governance processing failed: %s", exc)
