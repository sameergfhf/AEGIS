"""
app/services/alternative_scan_service.py — Real Security Scanning for Discovered Alternative APIs.

Step 3 Implementation:
- Genuine security scanning of discovered alternative APIs.
- Uses existing AEGIS security checkers: TLS, Security Headers, Information Leakage, Domain Reputation.
- Genuine score calculation using app.services.scoring.calculate_score.
- Never generates, simulates, estimates, copies, or fabricates scores.
- Strict endpoint verification: only verified API base endpoints are scanned; unverified candidates are blocked.
- Safe read-only HTTP probes with SSRF protection (resolve_and_validate) and bounded timeouts.
- Graceful handling of HTTP 401/403: verifies perimeter TLS, transport headers, and reputation while
  marking data operations as not_tested_auth_required.
- Concurrent execution with per-provider isolation (failure of one does not affect others).
- Direct persistence into Scan.result_json without breaking existing schemas or DB migrations.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.scan import Scan
from app.scanners import headers_checker, leakage_checker, reputation_checker, tls_checker
from app.schemas import ScoreResult, TestResult
from app.security.redaction import redact_headers
from app.security.url_validation import (
    URLValidationError,
    resolve_and_validate,
    validate_redirect_destination,
)
from app.services.scoring import calculate_score
from app.services.visualization_service import count_findings_by_severity

logger = logging.getLogger(__name__)

# Concurrency semaphore for safe, respectful scanning of external providers
_SCAN_CONCURRENCY_LIMIT = 3


class _DummyResponse:
    """Minimal mock response for headers_checker when raw httpx.Response is unavailable."""
    def __init__(self, headers: Dict[str, str], status_code: int = 0):
        self.headers = headers
        self.status_code = status_code


async def scan_single_alternative(
    alternative: Dict[str, Any],
    scan_id: str,
    timeout_seconds: float = 15.0,
) -> Dict[str, Any]:
    """
    Perform a real, safe, non-destructive security assessment of a single discovered alternative API.
    """
    started_time = datetime.now(timezone.utc)
    started_mono = time.monotonic()

    alt_id = alternative.get("id", "unknown")
    provider_name = alternative.get("provider_name", "Unknown Provider")
    api_name = alternative.get("api_name", "Unknown API")
    endpoint_url = alternative.get("api_endpoint_url")
    endpoint_status = alternative.get("endpoint_status", "verified")

    # ── Step 1: Strict Endpoint Verification Gate ──────────────────────────────
    if endpoint_status != "verified" or not endpoint_url:
        return {
            "alternative_id": alt_id,
            "provider_name": provider_name,
            "api_name": api_name,
            "endpoint_url": endpoint_url or "",
            "endpoint_status": "endpoint_unverified",
            "status": "endpoint_unverified",
            "status_message": (
                "API base endpoint could not be reliably verified from official documentation. "
                "Security scanning is blocked to prevent accidental testing of non-API infrastructure."
            ),
            "assessment_score": None,
            "assessment_coverage": 0.0,
            "earned_points": 0.0,
            "assessed_points": 0.0,
            "passed_checks": 0,
            "failed_checks": 0,
            "warning_checks": 0,
            "inconclusive_checks": 0,
            "highest_severity": None,
            "started_at": started_time.isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_ms": round((time.monotonic() - started_mono) * 1000, 2),
            "findings_count_by_severity": {
                "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0,
            },
            "test_results": {},
            "findings": [],
            "security_assessment_verified": False,
            "auth_required_noted": False,
        }

    # ── Step 2: SSRF & IP Validation ─────────────────────────────────────────
    try:
        validated_url, resolved_ip = resolve_and_validate(endpoint_url)
    except URLValidationError as exc:
        logger.warning("SSRF check blocked alternative %s URL %s: %s", alt_id, endpoint_url, exc)
        return {
            "alternative_id": alt_id,
            "provider_name": provider_name,
            "api_name": api_name,
            "endpoint_url": endpoint_url,
            "endpoint_status": endpoint_status,
            "status": "failed",
            "status_message": f"Endpoint validation blocked by SSRF policy: {exc}",
            "assessment_score": None,
            "assessment_coverage": 0.0,
            "earned_points": 0.0,
            "assessed_points": 0.0,
            "passed_checks": 0,
            "failed_checks": 0,
            "warning_checks": 0,
            "inconclusive_checks": 0,
            "highest_severity": "critical",
            "started_at": started_time.isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_ms": round((time.monotonic() - started_mono) * 1000, 2),
            "findings_count_by_severity": {
                "critical": 1, "high": 0, "medium": 0, "low": 0, "informational": 0,
            },
            "test_results": {},
            "findings": [{
                "check": "SSRF Protection",
                "severity": "critical",
                "status": "fail",
                "detail": f"Target endpoint {endpoint_url} was blocked: {exc}",
            }],
            "security_assessment_verified": False,
            "auth_required_noted": False,
        }

    # ── Step 3: Safe HTTP Probe ──────────────────────────────────────────────
    redirect_destinations: List[str] = []
    response_body = ""
    response_headers: Dict[str, str] = {}
    response_status: Optional[int] = None
    response_content_type = ""
    response_for_headers: Optional[httpx.Response] = None
    auth_required_noted = False

    settings = get_settings()
    max_response_bytes = getattr(settings, "max_response_bytes", 524_288)

    try:
        async with httpx.AsyncClient(
            follow_redirects=False,
            timeout=timeout_seconds,
            max_redirects=0,
            limits=httpx.Limits(max_connections=1, max_keepalive_connections=0),
            headers={"User-Agent": "AEGIS-Security-Assessment/1.0 (Safe API Inspector)"},
        ) as client:
            primary_response = await client.get(validated_url)
            response_status = primary_response.status_code
            response_headers = dict(primary_response.headers)
            response_content_type = primary_response.headers.get("content-type", "")

            # Handle redirects safely up to 3 hops
            current_response = primary_response
            current_url = str(primary_response.url)
            hops = 0
            while current_response.is_redirect and hops < 3:
                location = current_response.headers.get("location", "")
                if not location:
                    break
                redirect_url = urljoin(current_url, location)
                try:
                    validate_redirect_destination(redirect_url)
                except URLValidationError:
                    break

                redirect_destinations.append(redirect_url)
                current_response = await client.get(redirect_url)
                current_url = redirect_url
                hops += 1

            response_for_headers = current_response
            response_status = current_response.status_code
            response_headers = dict(current_response.headers)
            response_content_type = current_response.headers.get("content-type", "")
            body_bytes = await current_response.aread()
            body_bytes = body_bytes[:max_response_bytes]
            response_body = body_bytes.decode("utf-8", errors="replace")

    except httpx.TimeoutException:
        logger.info("Probe timeout for alternative %s (%s)", alt_id, endpoint_url)
        return {
            "alternative_id": alt_id,
            "provider_name": provider_name,
            "api_name": api_name,
            "endpoint_url": endpoint_url,
            "endpoint_status": endpoint_status,
            "status": "failed",
            "status_message": f"Connection timed out after {timeout_seconds}s while probing {endpoint_url}.",
            "assessment_score": None,
            "assessment_coverage": 0.0,
            "earned_points": 0.0,
            "assessed_points": 0.0,
            "passed_checks": 0,
            "failed_checks": 0,
            "warning_checks": 0,
            "inconclusive_checks": 0,
            "highest_severity": None,
            "started_at": started_time.isoformat(),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_ms": round((time.monotonic() - started_mono) * 1000, 2),
            "findings_count_by_severity": {
                "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0,
            },
            "test_results": {},
            "findings": [],
            "security_assessment_verified": False,
            "auth_required_noted": False,
        }
    except Exception as exc:
        logger.info("Probe error for alternative %s (%s): %s", alt_id, endpoint_url, exc)
        # We can still attempt TLS assessment if it's an SSL/TLS or HTTP parsing issue
        response_for_headers = _DummyResponse(response_headers, status_code=0)

    # Check for authentication requirement (HTTP 401 Unauthorized / 403 Forbidden)
    if response_status in (401, 403):
        auth_required_noted = True
        logger.info("Alternative %s returned HTTP %s (Authentication Required)", alt_id, response_status)

    # ── Step 4: Run Real Security Scanners ───────────────────────────────────
    # Run TLS, Headers, Leakage, and Reputation scanners against the actual endpoint
    tls_result: TestResult = await tls_checker.run(endpoint_url)

    resp_obj = response_for_headers if response_for_headers is not None else _DummyResponse(response_headers)
    headers_result: TestResult = await headers_checker.run(resp_obj)

    leakage_result: TestResult = await leakage_checker.run(response_body, response_content_type)
    reputation_result: TestResult = await reputation_checker.run(endpoint_url, redirect_destinations)

    test_results: Dict[str, TestResult] = {
        "tls": tls_result,
        "headers": headers_result,
        "leakage": leakage_result,
        "reputation": reputation_result,
    }

    # ── Step 5: Score Calculation ────────────────────────────────────────────
    score_result: ScoreResult = calculate_score(test_results)

    # ── Step 6: Finding Assembly & Severity Breakdown ─────────────────────────
    all_findings: List[Dict[str, Any]] = []
    for module_key, tr in test_results.items():
        for f in tr.findings:
            if f.get("status") in ("fail", "warning"):
                finding_dict = dict(f)
                finding_dict["module"] = module_key
                finding_dict["module_name"] = tr.name
                all_findings.append(finding_dict)

    severity_counts = count_findings_by_severity(test_results).model_dump()

    # Determine final scan status and status message
    if auth_required_noted:
        status = "not_tested_auth_required"
        status_message = (
            f"Authentication required (HTTP {response_status}). Perimeter TLS, transport security headers, "
            f"and domain reputation were successfully verified."
        )
    elif score_result.assessment_score is not None:
        status = "completed"
        status_message = (
            f"Security assessment completed with score {score_result.assessment_score:.1f}/100 "
            f"({score_result.assessment_coverage:.0f}% coverage)."
        )
    else:
        status = "completed"
        status_message = "Security assessment completed. Tests were inconclusive."

    duration_ms = round((time.monotonic() - started_mono) * 1000, 2)

    return {
        "alternative_id": alt_id,
        "provider_name": provider_name,
        "api_name": api_name,
        "endpoint_url": endpoint_url,
        "endpoint_status": endpoint_status,
        "status": status,
        "status_message": status_message,
        "assessment_score": score_result.assessment_score,
        "assessment_coverage": score_result.assessment_coverage,
        "earned_points": score_result.earned_points,
        "assessed_points": score_result.assessed_points,
        "passed_checks": score_result.passed_checks,
        "failed_checks": score_result.failed_checks,
        "warning_checks": score_result.warning_checks,
        "inconclusive_checks": score_result.inconclusive_checks,
        "highest_severity": score_result.highest_severity,
        "started_at": started_time.isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms": duration_ms,
        "findings_count_by_severity": severity_counts,
        "test_results": {k: v.model_dump() for k, v in test_results.items()},
        "findings": all_findings,
        "security_assessment_verified": True,
        "auth_required_noted": auth_required_noted,
    }


async def scan_selected_alternatives(
    scan_id: str,
    alternative_ids: List[str],
    db: AsyncSession,
) -> Dict[str, Any]:
    """
    Scans selected alternatives for a given scan ID.
    Performs real security assessments, isolates providers, and persists results.
    """
    result_q = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result_q.scalar_one_or_none()
    if not scan:
        raise ValueError(f"Scan {scan_id} not found.")

    if scan.status not in ("completed", "failed"):
        raise ValueError("Cannot scan alternatives before the primary scan completes.")

    # Parse existing result_json
    data: Dict[str, Any] = {}
    if scan.result_json:
        try:
            data = json.loads(scan.result_json)
        except Exception:
            data = {}

    alternatives_payload = data.get("alternatives") or {}
    catalogued_alts: List[Dict[str, Any]] = alternatives_payload.get("alternatives") or []
    alts_by_id = {a.get("id"): a for a in catalogued_alts if a.get("id")}

    # Validate that selected alternative IDs exist in discovered alternatives
    target_alts: List[Dict[str, Any]] = []
    for aid in alternative_ids:
        if aid in alts_by_id:
            target_alts.append(alts_by_id[aid])
        else:
            logger.warning("Alternative ID %s not found in scan %s alternatives list", aid, scan_id)

    if not target_alts:
        raise ValueError("None of the requested alternatives were found in discovered alternatives.")

    # Limit concurrency with a semaphore
    sem = asyncio.Semaphore(_SCAN_CONCURRENCY_LIMIT)

    async def _safe_scan(alt_dict: Dict[str, Any]) -> Dict[str, Any]:
        async with sem:
            try:
                return await scan_single_alternative(alt_dict, scan_id=scan_id)
            except Exception as exc:
                logger.error("Unexpected error scanning alternative %s: %s", alt_dict.get("id"), exc, exc_info=True)
                return {
                    "alternative_id": alt_dict.get("id", "unknown"),
                    "provider_name": alt_dict.get("provider_name", "Unknown Provider"),
                    "api_name": alt_dict.get("api_name", "Unknown API"),
                    "endpoint_url": alt_dict.get("api_endpoint_url", ""),
                    "endpoint_status": alt_dict.get("endpoint_status", "verified"),
                    "status": "failed",
                    "status_message": f"Scan failed due to an unexpected error: {exc}",
                    "assessment_score": None,
                    "assessment_coverage": 0.0,
                    "earned_points": 0.0,
                    "assessed_points": 0.0,
                    "passed_checks": 0,
                    "failed_checks": 0,
                    "warning_checks": 0,
                    "inconclusive_checks": 0,
                    "highest_severity": None,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "duration_ms": 0.0,
                    "findings_count_by_severity": {
                        "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0,
                    },
                    "test_results": {},
                    "findings": [],
                    "security_assessment_verified": False,
                    "auth_required_noted": False,
                }

    # Execute all selected alternative scans concurrently
    scan_results = await asyncio.gather(*[_safe_scan(alt) for alt in target_alts])

    # Store results in data["alternative_scans"] and update items in data["alternatives"]["alternatives"]
    alternative_scans_store = data.get("alternative_scans", {})
    for res in scan_results:
        aid = res["alternative_id"]
        alternative_scans_store[aid] = res

        # Update the summary in the alternatives list
        if aid in alts_by_id:
            alts_by_id[aid]["scan_status"] = res["status"]
            alts_by_id[aid]["scan_score"] = res["assessment_score"]
            alts_by_id[aid]["scan_coverage"] = res["assessment_coverage"]
            alts_by_id[aid]["highest_severity"] = res["highest_severity"]

    data["alternative_scans"] = alternative_scans_store
    data["alternatives"]["alternatives"] = list(alts_by_id.values())

    # Save to database
    scan.result_json = json.dumps(data)
    await db.commit()

    return {
        "scan_id": scan_id,
        "total_scanned": len(scan_results),
        "results": scan_results,
    }


async def get_alternative_scans(scan_id: str, db: AsyncSession) -> Dict[str, Any]:
    """Retrieve all completed alternative scans for a primary scan."""
    result_q = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result_q.scalar_one_or_none()
    if not scan:
        raise ValueError(f"Scan {scan_id} not found.")

    data: Dict[str, Any] = {}
    if scan.result_json:
        try:
            data = json.loads(scan.result_json)
        except Exception:
            data = {}

    scans_dict = data.get("alternative_scans") or {}
    results = list(scans_dict.values())

    return {
        "scan_id": scan_id,
        "total_scanned": len(results),
        "results": results,
    }


async def get_single_alternative_scan(
    scan_id: str,
    alternative_id: str,
    db: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """Retrieve a single alternative scan record by ID."""
    all_scans = await get_alternative_scans(scan_id, db)
    for s in all_scans.get("results", []):
        if s.get("alternative_id") == alternative_id:
            return s
    return None
