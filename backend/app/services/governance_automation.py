"""Evidence-based policy evaluation and finding-to-incident automation."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from app.services.supabase_sync import _get_rest_headers, _get_supabase_config

logger = logging.getLogger(__name__)


async def notify_scan_failure(workspace_id: str | None, user_id: str | None, scan_id: str) -> None:
    if not workspace_id or not user_id:
        return
    base, key = _get_supabase_config()
    if not base or not key:
        return
    headers = _get_rest_headers()
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=False) as client:
        recipients = {user_id}
        try:
            workspace = await client.get(f"{base}/rest/v1/workspaces", params={"id": f"eq.{workspace_id}", "select": "owner_id"}, headers=headers)
            workspace.raise_for_status()
            recipients.update(row["owner_id"] for row in workspace.json() if row.get("owner_id"))
            members = await client.get(f"{base}/rest/v1/workspace_members", params={"workspace_id": f"eq.{workspace_id}", "status": "eq.active", "select": "user_id"}, headers=headers)
            members.raise_for_status()
            recipients.update(row["user_id"] for row in members.json() if row.get("user_id"))
            response = await client.post(f"{base}/rest/v1/workspace_notifications", headers={**headers, "Prefer": "return=minimal"}, json=[
                {"workspace_id": workspace_id, "user_id": recipient, "event_type": "scan.failed",
                 "title": "Workspace scan failed", "body": "A scan failed before producing an assessment. Review the scan record for status.", "resource_id": scan_id}
                for recipient in recipients
            ])
            response.raise_for_status()
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            logger.warning("Scan failure notification could not be stored: %s", exc)


def _checks(result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    for module in (result.get("test_results") or {}).values():
        for finding in module.get("findings") or []:
            name = str(finding.get("check") or finding.get("name") or "").lower()
            if name:
                found[name] = finding
    return found


def evaluate_policy(policy: dict[str, Any], scan: dict[str, Any]) -> dict[str, Any]:
    """Return a conservative outcome; absent evidence is never a pass."""
    kind = policy.get("rule_type")
    config = policy.get("configuration") or {}
    result_json = scan.get("result_json") or {}
    if isinstance(result_json, str):
        try:
            result_json = json.loads(result_json)
        except (ValueError, TypeError):
            result_json = {}
    checks = _checks(result_json)
    score = scan.get("score")
    coverage = (result_json.get("score") or {}).get("assessment_coverage")

    if kind == "https_required":
        actual = urlparse(scan.get("target_url") or "").scheme.lower()
        applicable, passed, why = True, actual == "https", f"Target scheme is {actual or 'unknown'}."
    elif kind in {"hsts_required", "csp_required", "content_type_options_required"}:
        labels = {"hsts_required": "strict-transport-security", "csp_required": "content-security-policy", "content_type_options_required": "x-content-type-options"}
        item = checks.get(labels[kind])
        if not item:
            return {"outcome": "inconclusive", "reason": "The scan did not provide evidence for this header control.", "evidence": {}}
        applicable = item.get("status") != "not_applicable"
        passed = item.get("status") == "pass"
        why = str(item.get("detail") or item.get("status") or "Header control evaluated.")[:1800]
    elif kind == "minimum_score":
        threshold = config.get("minimum", config.get("threshold", config.get("value")))
        if not isinstance(score, (int, float)) or not isinstance(threshold, (int, float)):
            return {"outcome": "inconclusive", "reason": "Score or configured minimum is unavailable.", "evidence": {}}
        applicable, passed = True, score >= threshold
        why = f"Observed score {score}; required minimum is {threshold}."
    elif kind == "minimum_coverage":
        threshold = config.get("minimum", config.get("threshold", config.get("value")))
        if not isinstance(coverage, (int, float)) or not isinstance(threshold, (int, float)):
            return {"outcome": "inconclusive", "reason": "Coverage or configured minimum is unavailable.", "evidence": {}}
        applicable, passed = True, coverage >= threshold
        why = f"Observed coverage {coverage}; required minimum is {threshold}."
    elif kind == "maximum_critical_findings":
        maximum = config.get("maximum", config.get("threshold", config.get("value")))
        if not isinstance(maximum, int):
            return {"outcome": "inconclusive", "reason": "Policy maximum is not configured as an integer.", "evidence": {}}
        count = sum(1 for f in scan.get("findings", []) if f.get("severity") == "critical")
        applicable, passed = True, count <= maximum
        why = f"Observed {count} critical findings; allowed maximum is {maximum}."
    elif kind == "minimum_tls":
        tls_evidence = ((result_json.get("test_results") or {}).get("tls") or {}).get("evidence") or {}
        version = (tls_evidence.get("tls_info") or {}).get("tls_version")
        if not version:
            return {"outcome": "inconclusive", "reason": "Negotiated TLS version was not available in scan evidence.", "evidence": {}}
        required = str(config.get("minimum", config.get("version", "TLSv1.2")))
        rank = {"TLSv1": 1, "TLSv1.1": 11, "TLSv1.2": 12, "TLSv1.3": 13}
        actual_rank = rank.get(str(version))
        required_rank = rank.get(required)
        if actual_rank is None or required_rank is None:
            return {"outcome": "inconclusive", "reason": "TLS version could not be compared safely.", "evidence": {"observed": str(version), "required": required}}
        applicable, passed = True, actual_rank >= required_rank
        why = f"Observed TLS {version}; required minimum is {required}."
    elif kind == "certificate_expiry_days":
        tls_evidence = ((result_json.get("test_results") or {}).get("tls") or {}).get("evidence") or {}
        days_left = (tls_evidence.get("tls_info") or {}).get("days_until_expiry")
        threshold = config.get("threshold", config.get("days", 30))
        if not isinstance(days_left, (int, float)) or not isinstance(threshold, (int, float)):
            return {"outcome": "inconclusive", "reason": "Certificate expiry or configured warning threshold is unavailable.", "evidence": {}}
        applicable, passed = True, days_left > threshold
        why = f"Certificate expires in {days_left} days; warning threshold is {threshold} days."
    elif kind == "scan_frequency_days":
        threshold = config.get("threshold", config.get("days"))
        elapsed = scan.get("days_since_previous_scan")
        if not isinstance(threshold, (int, float)) or not isinstance(elapsed, (int, float)):
            return {"outcome": "inconclusive", "reason": "A previous completed scan or configured frequency threshold is unavailable.", "evidence": {}}
        applicable, passed = True, elapsed <= threshold
        why = f"Previous completed scan was {elapsed:.1f} days ago; required frequency is every {threshold} days."
    else:
        return {"outcome": "not_applicable", "reason": "Unsupported policy rule type.", "evidence": {}}

    outcome = "not_applicable" if not applicable else ("compliant" if passed else "non_compliant")
    return {"outcome": outcome, "reason": why[:2000], "evidence": {"policy_type": kind, "scan_id": scan.get("id")}}


async def process_workspace_scan(scan: dict[str, Any], findings: list[dict[str, Any]]) -> None:
    """Persist evaluations and create idempotent incidents for high/critical findings."""
    workspace_id, user_id = scan.get("workspace_id"), scan.get("user_id")
    if not workspace_id or not user_id:
        return
    base, key = _get_supabase_config()
    if not base or not key:
        return
    headers = _get_rest_headers()
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=False) as client:
        recipients = {user_id}
        try:
            ws = await client.get(f"{base}/rest/v1/workspaces", params={"id": f"eq.{workspace_id}", "select": "owner_id"}, headers=headers)
            ws.raise_for_status()
            recipients.update(row["owner_id"] for row in ws.json() if row.get("owner_id"))
            members = await client.get(f"{base}/rest/v1/workspace_members", params={"workspace_id": f"eq.{workspace_id}", "status": "eq.active", "select": "user_id"}, headers=headers)
            members.raise_for_status()
            recipients.update(row["user_id"] for row in members.json() if row.get("user_id"))
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            logger.warning("Workspace alert recipients could not be loaded: %s", exc)

        async def notify(event_type: str, title: str, body: str, resource_id: str | None) -> None:
            rows = [{"workspace_id": workspace_id, "user_id": recipient, "event_type": event_type,
                     "title": title[:240], "body": body[:2000], "resource_id": resource_id}
                    for recipient in recipients]
            if not rows:
                return
            try:
                sent = await client.post(f"{base}/rest/v1/workspace_notifications", headers={**headers, "Prefer": "return=minimal"}, json=rows)
                sent.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("Workspace notification delivery failed: %s", exc)

        try:
            response = await client.get(
                f"{base}/rest/v1/workspace_security_policies",
                params={"workspace_id": f"eq.{workspace_id}", "enabled": "eq.true", "select": "id,workspace_id,name,rule_type,configuration,severity,alert_on_violation"},
                headers=headers,
            )
            response.raise_for_status()
            policies = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Workspace policy load failed for scan %s: %s", scan.get("id"), exc)
            policies = []
        days_since_previous = None
        try:
            prior = await client.get(
                f"{base}/rest/v1/scans",
                params={"user_id": f"eq.{user_id}", "workspace_id": f"eq.{workspace_id}",
                        "target_url": f"eq.{scan.get('url', '')}", "id": f"neq.{scan['id']}",
                        "status": "eq.completed", "select": "started_at", "order": "started_at.desc", "limit": "1"},
                headers=headers,
            )
            prior.raise_for_status()
            rows = prior.json()
            if rows:
                previous_at = datetime.fromisoformat(rows[0]["started_at"].replace("Z", "+00:00"))
                current_at = datetime.now(timezone.utc)
                days_since_previous = max(0.0, (current_at - previous_at).total_seconds() / 86400)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.info("Prior scan history unavailable for frequency policy: %s", exc)
        for policy in policies:
            evaluation = evaluate_policy(policy, {**scan, "findings": findings, "days_since_previous_scan": days_since_previous})
            try:
                saved = await client.post(
                    f"{base}/rest/v1/workspace_policy_evaluations",
                    params={"on_conflict": "policy_id,scan_id"},
                    headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
                    json={"workspace_id": workspace_id, "policy_id": policy["id"], "scan_id": scan["id"], **evaluation},
                )
                saved.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("Policy evaluation persistence failed for policy %s: %s", policy.get("id"), exc)
            if evaluation["outcome"] == "non_compliant" and policy.get("alert_on_violation"):
                await notify("policy.violation", f"Policy violation: {policy.get('name', 'Workspace policy')}", evaluation["reason"], str(policy.get("id")))

        for finding in findings:
            severity = str(finding.get("severity", "")).lower()
            if severity not in {"high", "critical"}:
                continue
            fingerprint = "finding:" + hashlib.sha256(
                "|".join((scan.get("url", ""), finding.get("rule_reference") or finding.get("title", ""))).encode("utf-8")
            ).hexdigest()
            payload = {
                "workspace_id": workspace_id,
                "related_scan_id": scan["id"],
                "finding_ids": [finding["id"]] if finding.get("id") else [],
                "deduplication_key": fingerprint,
                "title": str(finding.get("title") or "Security finding")[:240],
                "description": str(finding.get("description") or finding.get("why_it_matters") or "")[:10000],
                "severity": severity,
                "priority": severity,
                "created_by": user_id,
                "evidence": {"source": "AEGIS scan", "finding_id": finding.get("id"), "rule_reference": finding.get("rule_reference")},
            }
            try:
                created = await client.post(f"{base}/rest/v1/workspace_incidents", headers={**headers, "Prefer": "return=minimal"}, json=payload)
                if created.status_code not in (200, 201, 204, 409):
                    logger.warning("Finding incident creation returned %s: %s", created.status_code, created.text[:500])
                if created.status_code in (200, 201, 204):
                    await notify("finding.created", f"{severity.title()} finding: {payload['title']}", payload["description"], str(finding.get("id") or scan["id"]))
            except httpx.HTTPError as exc:
                logger.warning("Finding incident creation failed for scan %s: %s", scan.get("id"), exc)
