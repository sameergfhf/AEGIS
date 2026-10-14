"""
app/scanners/reputation_checker.py — Test 4: Domain & Redirect Reputation (25 points).

Checks the submitted hostname and redirect destinations against VirusTotal.
Clearly distinguishes:
  - Threat match (malicious / suspicious)
  - No known threat found
  - Unknown (API unavailable, quota exceeded, or key not configured)

Does NOT follow redirects blindly — each destination is validated through
url_validation before being queried.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from app.config import get_settings
from app.schemas import TestResult
from app.security.url_validation import validate_redirect_destination, URLValidationError

MAX_POINTS = 25
_VT_URL = "https://www.virustotal.com/api/v3/domains/{domain}"
_VT_URL_LOOKUP = "https://www.virustotal.com/api/v3/urls"

settings = get_settings()


async def _query_virustotal_domain(client: httpx.AsyncClient, domain: str) -> Dict[str, Any]:
    """Query VT domain report. Returns result dict with status and raw data."""
    if not settings.virustotal_enabled:
        return {"status": "unavailable", "reason": "VirusTotal API key not configured."}

    try:
        resp = await client.get(
            _VT_URL.format(domain=domain),
            headers={"x-apikey": settings.virustotal_api_key},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            stats = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
            malicious = stats.get("malicious", 0)
            suspicious = stats.get("suspicious", 0)
            harmless = stats.get("harmless", 0)
            undetected = stats.get("undetected", 0)
            total = malicious + suspicious + harmless + undetected

            return {
                "status": "threat" if malicious > 0 else ("suspicious" if suspicious > 0 else "clean"),
                "malicious_votes": malicious,
                "suspicious_votes": suspicious,
                "harmless_votes": harmless,
                "total_engines": total,
                "reputation": data.get("data", {}).get("attributes", {}).get("reputation", None),
            }
        elif resp.status_code == 404:
            return {"status": "unknown", "reason": "Domain not found in VirusTotal database."}
        elif resp.status_code == 429:
            return {"status": "unavailable", "reason": "VirusTotal rate limit exceeded."}
        else:
            return {"status": "unavailable", "reason": f"VirusTotal returned HTTP {resp.status_code}."}
    except httpx.TimeoutException:
        return {"status": "unavailable", "reason": "VirusTotal request timed out."}
    except Exception as exc:
        return {"status": "unavailable", "reason": f"VirusTotal query failed: {exc}"}


async def run(
    url: str,
    redirect_destinations: Optional[List[str]] = None,
) -> TestResult:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    redirect_destinations = redirect_destinations or []

    earned = MAX_POINTS
    findings: List[Dict[str, Any]] = []
    evidence: Dict[str, Any] = {
        "queried_domain": hostname,
        "redirect_destinations": redirect_destinations,
        "provider": "VirusTotal" if settings.virustotal_enabled else "none",
    }
    recommendations: List[str] = []
    overall_status = "pass"

    async with httpx.AsyncClient() as client:
        # ── Primary domain check ────────────────────────────────────────────
        vt_result = await _query_virustotal_domain(client, hostname)
        evidence["primary_domain_result"] = vt_result

        if vt_result["status"] == "threat":
            earned -= 20
            overall_status = "fail"
            findings.append({
                "check": f"Domain reputation: {hostname}",
                "status": "fail",
                "severity": "critical",
                "confidence": "confirmed",
                "detail": (
                    f"VirusTotal flagged '{hostname}' as malicious "
                    f"({vt_result['malicious_votes']} engines)."
                ),
                "why_it_matters": "The domain is identified as malicious by multiple threat intelligence engines.",
                "remediation": "Do not interact with this API. Investigate whether this domain has been compromised.",
            })
        elif vt_result["status"] == "suspicious":
            earned -= 10
            overall_status = "warning"
            findings.append({
                "check": f"Domain reputation: {hostname}",
                "status": "warning",
                "severity": "high",
                "confidence": "likely",
                "detail": (
                    f"VirusTotal flagged '{hostname}' as suspicious "
                    f"({vt_result['suspicious_votes']} engines)."
                ),
                "why_it_matters": "Some threat intelligence engines classify this domain as suspicious.",
                "remediation": "Investigate the domain before integrating this API.",
            })
        elif vt_result["status"] == "clean":
            findings.append({
                "check": f"Domain reputation: {hostname}",
                "status": "pass",
                "severity": None,
                "detail": (
                    f"VirusTotal found no malicious signals for '{hostname}' "
                    f"({vt_result['harmless_votes']} harmless / {vt_result['total_engines']} engines)."
                ),
            })
        elif vt_result["status"] == "unknown":
            earned -= 5
            if overall_status == "pass":
                overall_status = "inconclusive"
            findings.append({
                "check": f"Domain reputation: {hostname}",
                "status": "inconclusive",
                "severity": "informational",
                "detail": f"Domain '{hostname}' is not in the VirusTotal database. This may indicate a new or very low-traffic domain.",
            })
        else:  # unavailable
            if overall_status == "pass":
                overall_status = "inconclusive"
            findings.append({
                "check": f"Domain reputation: {hostname}",
                "status": "inconclusive",
                "severity": None,
                "detail": f"Reputation check unavailable: {vt_result.get('reason', 'Unknown error')}",
            })
            # Don't deduct points if the provider is unavailable
            earned = MAX_POINTS

        # ── Redirect destination checks ────────────────────────────────────
        for dest_url in redirect_destinations[:5]:  # Limit to 5 destinations
            dest_hostname = urlparse(dest_url).hostname or ""
            if not dest_hostname or dest_hostname == hostname:
                continue

            # Validate before querying
            try:
                validate_redirect_destination(dest_url)
            except URLValidationError as exc:
                findings.append({
                    "check": f"Redirect destination: {dest_hostname}",
                    "status": "fail",
                    "severity": "high",
                    "detail": f"Redirect to blocked destination: {exc}",
                })
                earned -= 10
                overall_status = "fail"
                continue

            dest_vt = await _query_virustotal_domain(client, dest_hostname)
            evidence[f"redirect_{dest_hostname}"] = dest_vt

            if dest_vt["status"] == "threat":
                earned -= 15
                overall_status = "fail"
                findings.append({
                    "check": f"Redirect destination: {dest_hostname}",
                    "status": "fail",
                    "severity": "critical",
                    "confidence": "confirmed",
                    "detail": f"Redirect destination '{dest_hostname}' is flagged as malicious by VirusTotal.",
                    "why_it_matters": "A redirect to a malicious domain could expose users to phishing, malware, or data theft.",
                    "remediation": "Investigate why this API redirects to a flagged domain.",
                })
            elif dest_vt["status"] == "clean":
                findings.append({
                    "check": f"Redirect destination: {dest_hostname}",
                    "status": "pass",
                    "detail": f"Redirect destination '{dest_hostname}' has a clean reputation.",
                })

    # Clamp earned points
    earned = max(0.0, min(earned, MAX_POINTS))

    if not settings.virustotal_enabled:
        overall_status = "inconclusive"
        findings.append({
            "check": "Threat intelligence provider",
            "status": "inconclusive",
            "detail": "No threat intelligence API key configured. Configure VIRUSTOTAL_API_KEY in .env to enable reputation checks.",
        })
        earned = 0.0  # Cannot assess without a provider

    return TestResult(
        name="Domain and Redirect Reputation",
        status=overall_status,
        earned_points=earned,
        max_points=MAX_POINTS,
        findings=findings,
        evidence=evidence,
        recommendations=recommendations,
    )
