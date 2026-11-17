"""Server-only persistence bridge to the canonical workspace Supabase project.

SQLAlchemy stores the live execution state. This writer maintains the canonical
workspace scan projection read through Supabase Auth and RLS.
"""
from __future__ import annotations
import logging
from typing import Any
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_supabase_config() -> tuple[str, str]:
    settings = get_settings()
    return settings.supabase_auth_url.rstrip("/"), settings.supabase_workspace_service_role_key


def _get_rest_headers() -> dict[str, str]:
    _, key = _get_supabase_config()
    if not key:
        raise ValueError("Canonical workspace service authentication is not configured.")
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


async def sync_scan_to_supabase(*, scan_id: str, target_url: str, hostname: str,
    status: str, score: float | None, duration_ms: float | None,
    passed_checks: int, failed_checks: int, warning_checks: int,
    inconclusive_checks: int, highest_severity: str | None,
    user_id: str | None, user_email: str | None, findings: list[dict[str, Any]],
    visualizations: dict[str, Any] | None = None, started_at: str | None = None,
    completed_at: str | None = None, result_json: str | None = None,
    workspace_id: str | None = None, scan_type: str = "full",
    earned_points: float | None = None, assessed_points: float | None = None,
    assessment_coverage: float | None = None) -> bool:
    if not user_id:
        return False
    base, _ = _get_supabase_config()
    headers = _get_rest_headers()
    metadata = {"hostname": hostname, "duration_ms": duration_ms,
        "passed_checks": passed_checks, "failed_checks": failed_checks,
        "warning_checks": warning_checks, "inconclusive_checks": inconclusive_checks,
        "highest_severity": highest_severity, "earned_points": earned_points,
        "assessed_points": assessed_points, "assessment_coverage": assessment_coverage,
        "user_email": user_email, "result_json": result_json,
        "visualizations": visualizations or {}}
    row = {"id": scan_id, "user_id": user_id, "workspace_id": workspace_id,
        "target_url": target_url, "scan_type": scan_type, "status": status,
        "score": score, "findings_count": failed_checks + warning_checks,
        "metadata": metadata}
    if started_at: row["started_at"] = started_at
    if completed_at: row["completed_at"] = completed_at
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.post(f"{base}/rest/v1/scans",
                headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
                params={"on_conflict": "id"}, json=row)
            response.raise_for_status()
            delete_response = await client.delete(f"{base}/rest/v1/scan_findings",
                headers=headers, params={"scan_id": f"eq.{scan_id}"})
            delete_response.raise_for_status()
            if findings:
                rows = [{"id": f["id"], "scan_id": scan_id, "user_id": user_id,
                    "title": f.get("title") or "Finding", "description": f.get("description") or "",
                    "severity": f.get("severity") or "informational", "endpoint": None,
                    "evidence": f.get("evidence") or "", "remediation": f.get("remediation") or "",
                    "metadata": {"category": f.get("category", "General"),
                        "confidence": f.get("confidence", "possible"), "status": f.get("status", "fail"),
                        "why_it_matters": f.get("why_it_matters"), "rule_reference": f.get("rule_reference")}}
                    for f in findings]
                finding_response = await client.post(f"{base}/rest/v1/scan_findings",
                    headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
                    params={"on_conflict": "id"}, json=rows)
                finding_response.raise_for_status()
        return True
    except (httpx.HTTPError, ValueError) as exc:
        logger.exception("Canonical Supabase scan persistence failed for %s", scan_id)
        return False
