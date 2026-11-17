"""
backend/tests/test_alternative_scanning.py — Comprehensive tests for Step 3:
Real Security Scanning of Discovered Alternative APIs.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.scan import Scan
from app.schemas import ScoreResult, TestResult
from app.services.alternative_scan_service import (
    scan_single_alternative,
    scan_selected_alternatives,
    get_alternative_scans,
    get_single_alternative_scan,
)


# ── 1. Endpoint Verification Gate ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_endpoint_unverified_is_blocked_from_scanning():
    """Candidates marked endpoint_unverified or missing API endpoint URL must NOT be scanned."""
    unverified_candidate = {
        "id": "unknown-provider-api",
        "provider_name": "Unverified Provider",
        "api_name": "Mysterious API",
        "api_endpoint_url": None,
        "endpoint_status": "endpoint_unverified",
    }

    result = await scan_single_alternative(unverified_candidate, scan_id="test-scan-1")
    assert result["status"] == "endpoint_unverified"
    assert result["endpoint_status"] == "endpoint_unverified"
    assert result["assessment_score"] is None
    assert result["security_assessment_verified"] is False
    assert "blocked" in result["status_message"].lower()


@pytest.mark.asyncio
async def test_endpoint_missing_url_is_blocked():
    """Even if endpoint_status says verified, if api_endpoint_url is empty, scanning is blocked."""
    empty_url_candidate = {
        "id": "missing-url-api",
        "provider_name": "Missing URL Provider",
        "api_name": "Missing URL API",
        "api_endpoint_url": "",
        "endpoint_status": "verified",
    }

    result = await scan_single_alternative(empty_url_candidate, scan_id="test-scan-1")
    assert result["status"] == "endpoint_unverified"
    assert result["assessment_score"] is None
    assert result["security_assessment_verified"] is False


# ── 2. SSRF Protection on Alternative Endpoints ─────────────────────────────────

@pytest.mark.asyncio
async def test_ssrf_protection_blocks_internal_and_cloud_metadata_ips():
    """SSRF filter must reject loopback, internal IPs, and AWS/GCP cloud metadata endpoints."""
    malicious_candidate = {
        "id": "evil-cloud-metadata",
        "provider_name": "Metadata Sniffer",
        "api_name": "Instance Metadata API",
        "api_endpoint_url": "http://169.254.169.254/latest/meta-data/",
        "endpoint_status": "verified",
    }

    result = await scan_single_alternative(malicious_candidate, scan_id="test-scan-1")
    assert result["status"] == "failed"
    assert "ssrf" in result["status_message"].lower() or "blocked" in result["status_message"].lower()
    assert result["assessment_score"] is None
    assert result["security_assessment_verified"] is False


@pytest.mark.asyncio
async def test_ssrf_protection_blocks_localhost():
    """Localhost / loopback endpoints must be blocked."""
    local_candidate = {
        "id": "localhost-api",
        "provider_name": "Localhost API",
        "api_name": "Local API",
        "api_endpoint_url": "http://127.0.0.1:8080/api",
        "endpoint_status": "verified",
    }

    result = await scan_single_alternative(local_candidate, scan_id="test-scan-1")
    assert result["status"] == "failed"
    assert result["assessment_score"] is None


# ── 3. Real Security Assessment Execution ───────────────────────────────────────

@pytest.mark.asyncio
async def test_scan_single_alternative_genuine_assessment():
    """
    Valid alternative endpoint triggers real scanner modules (TLS, Headers, Leakage, Reputation)
    and computes genuine score via calculate_score.
    """
    candidate = {
        "id": "openai-api",
        "provider_name": "OpenAI",
        "api_name": "OpenAI REST API",
        "api_endpoint_url": "https://api.openai.com/v1/models",
        "endpoint_status": "verified",
    }

    mock_tls = TestResult(
        name="HTTPS and TLS Security",
        status="pass",
        earned_points=30.0,
        max_points=30.0,
        findings=[{"check": "Certificate trust", "status": "pass", "severity": None, "detail": "Valid cert"}],
        evidence={"tls_info": {"protocol": "TLSv1.3"}},
        recommendations=[],
    )
    mock_headers = TestResult(
        name="HTTP Security Headers",
        status="pass",
        earned_points=16.0,
        max_points=20.0,
        findings=[
            {"check": "HSTS", "status": "pass", "severity": None, "detail": "HSTS present"},
            {"check": "X-Content-Type-Options", "status": "pass", "severity": None, "detail": "nosniff"},
        ],
        evidence={},
        recommendations=[],
    )
    mock_leakage = TestResult(
        name="Information Leakage",
        status="pass",
        earned_points=25.0,
        max_points=25.0,
        findings=[],
        evidence={},
        recommendations=[],
    )
    mock_reputation = TestResult(
        name="Domain & Redirect Reputation",
        status="pass",
        earned_points=25.0,
        max_points=25.0,
        findings=[],
        evidence={},
        recommendations=[],
    )

    # Mock HTTP response to return 200 OK
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.headers = {"strict-transport-security": "max-age=31536000", "content-type": "application/json"}
    mock_response.is_redirect = False
    mock_response.aread = AsyncMock(return_value=b'{"models": []}')

    with patch("app.services.alternative_scan_service.resolve_and_validate", return_value=("https://api.openai.com/v1/models", "104.18.6.192")), \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_response), \
         patch("app.services.alternative_scan_service.tls_checker.run", new_callable=AsyncMock, return_value=mock_tls), \
         patch("app.services.alternative_scan_service.headers_checker.run", new_callable=AsyncMock, return_value=mock_headers), \
         patch("app.services.alternative_scan_service.leakage_checker.run", new_callable=AsyncMock, return_value=mock_leakage), \
         patch("app.services.alternative_scan_service.reputation_checker.run", new_callable=AsyncMock, return_value=mock_reputation):

        result = await scan_single_alternative(candidate, scan_id="test-scan-1")

        assert result["status"] == "completed"
        assert result["security_assessment_verified"] is True
        assert result["assessment_score"] is not None
        # 30 + 16 + 25 + 25 = 96 earned out of 100 max = 96.0%
        assert result["assessment_score"] == 96.0
        assert result["assessment_coverage"] == 100.0
        assert result["passed_checks"] > 0
        assert "tls" in result["test_results"]
        assert "headers" in result["test_results"]
        assert "leakage" in result["test_results"]
        assert "reputation" in result["test_results"]


# ── 4. Handling HTTP 401/403 Authentication Requirement ─────────────────────────

@pytest.mark.asyncio
async def test_401_auth_required_handled_gracefully_with_perimeter_checks():
    """
    When an API returns 401 Unauthorized or 403 Forbidden, AEGIS must:
    1. Mark status as 'not_tested_auth_required'
    2. Set auth_required_noted = True
    3. Successfully verify perimeter TLS, headers, and domain reputation
    4. Provide clear explanatory status message
    """
    candidate = {
        "id": "stripe-api",
        "provider_name": "Stripe",
        "api_name": "Stripe Payments API",
        "api_endpoint_url": "https://api.stripe.com/v1/charges",
        "endpoint_status": "verified",
    }

    mock_tls = TestResult(
        name="HTTPS and TLS Security",
        status="pass",
        earned_points=30.0,
        max_points=30.0,
        findings=[{"check": "Certificate trust", "status": "pass", "severity": None, "detail": "Trusted CA"}],
        evidence={"tls_info": {"protocol": "TLSv1.3"}},
        recommendations=[],
    )
    mock_headers = TestResult(
        name="HTTP Security Headers",
        status="pass",
        earned_points=20.0,
        max_points=20.0,
        findings=[
            {"check": "HSTS", "status": "pass", "severity": None, "detail": "HSTS present with preload"},
            {"check": "X-Content-Type-Options", "status": "pass", "severity": None, "detail": "nosniff present"},
        ],
        evidence={},
        recommendations=[],
    )
    mock_leakage = TestResult(
        name="Information Leakage",
        status="pass",
        earned_points=25.0,
        max_points=25.0,
        findings=[],
        evidence={},
        recommendations=[],
    )
    mock_reputation = TestResult(
        name="Domain & Redirect Reputation",
        status="pass",
        earned_points=25.0,
        max_points=25.0,
        findings=[],
        evidence={},
        recommendations=[],
    )

    # Simulate httpx client returning 401 Unauthorized
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.headers = {"strict-transport-security": "max-age=63072000; includeSubDomains; preload"}
    mock_response.is_redirect = False
    mock_response.aread = AsyncMock(return_value=b'{"error": {"message": "You did not provide an API key."}}')

    with patch("app.services.alternative_scan_service.resolve_and_validate", return_value=("https://api.stripe.com/v1/charges", "3.238.169.17")), \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_response), \
         patch("app.services.alternative_scan_service.tls_checker.run", new_callable=AsyncMock, return_value=mock_tls), \
         patch("app.services.alternative_scan_service.headers_checker.run", new_callable=AsyncMock, return_value=mock_headers), \
         patch("app.services.alternative_scan_service.leakage_checker.run", new_callable=AsyncMock, return_value=mock_leakage), \
         patch("app.services.alternative_scan_service.reputation_checker.run", new_callable=AsyncMock, return_value=mock_reputation):

        result = await scan_single_alternative(candidate, scan_id="test-scan-1")

        assert result["status"] == "not_tested_auth_required"
        assert result["auth_required_noted"] is True
        assert "Authentication required" in result["status_message"]
        assert result["security_assessment_verified"] is True
        # Score from perimeter checks is preserved and accurate
        assert result["assessment_score"] == 100.0


# ── 5. Scoring Honesty: Never Fabricates Scores ─────────────────────────────────

@pytest.mark.asyncio
async def test_scoring_honesty_all_inconclusive_yields_none_score():
    """
    If tests cannot produce meaningful results (e.g. all inconclusive),
    assessment_score MUST be None (null), NEVER a fabricated 100.
    """
    candidate = {
        "id": "groq-cloud-api",
        "provider_name": "Groq",
        "api_name": "GroqCloud API",
        "api_endpoint_url": "https://api.groq.com/openai/v1/models",
        "endpoint_status": "verified",
    }

    inconclusive_test = TestResult(
        name="HTTPS and TLS Security",
        status="inconclusive",
        earned_points=0.0,
        max_points=30.0,
        findings=[{"check": "TLS", "status": "inconclusive", "severity": None, "detail": "Test inconclusive"}],
        evidence={},
        recommendations=[],
    )

    with patch("app.services.alternative_scan_service.resolve_and_validate", return_value=("https://api.groq.com/openai/v1/models", "104.18.2.1")), \
         patch("app.services.alternative_scan_service.tls_checker.run", new_callable=AsyncMock, return_value=inconclusive_test), \
         patch("app.services.alternative_scan_service.headers_checker.run", new_callable=AsyncMock, return_value=inconclusive_test), \
         patch("app.services.alternative_scan_service.leakage_checker.run", new_callable=AsyncMock, return_value=inconclusive_test), \
         patch("app.services.alternative_scan_service.reputation_checker.run", new_callable=AsyncMock, return_value=inconclusive_test):

        result = await scan_single_alternative(candidate, scan_id="test-scan-1")

        # Must NOT be 100!
        assert result["assessment_score"] is None
        assert result["assessment_coverage"] == 0.0


# ── 6. Multi-Alternative Scanning and Per-Provider Isolation ────────────────────

@pytest.mark.asyncio
async def test_scan_selected_alternatives_with_isolation():
    """
    When multiple alternatives are scanned, one failure must NOT crash or corrupt
    the scan results of other providers.
    """
    mock_scan = MagicMock(spec=Scan)
    mock_scan.id = "scan-123"
    mock_scan.status = "completed"
    mock_scan.result_json = json.dumps({
        "alternatives": {
            "category": "AI / LLM API",
            "alternatives": [
                {
                    "id": "openai-api",
                    "provider_name": "OpenAI",
                    "api_name": "OpenAI API",
                    "api_endpoint_url": "https://api.openai.com/v1/models",
                    "endpoint_status": "verified",
                },
                {
                    "id": "failing-provider",
                    "provider_name": "Broken API",
                    "api_name": "Broken API",
                    "api_endpoint_url": "https://broken.invalid/api",
                    "endpoint_status": "verified",
                },
            ]
        }
    })

    mock_db = AsyncMock()
    mock_execute_res = MagicMock()
    mock_execute_res.scalar_one_or_none.return_value = mock_scan
    mock_db.execute.return_value = mock_execute_res

    # Mock scan_single_alternative so openai succeeds and broken fails
    async def fake_scan(alt_dict, scan_id, timeout_seconds=15.0):
        if alt_dict["id"] == "openai-api":
            return {
                "alternative_id": "openai-api",
                "provider_name": "OpenAI",
                "api_name": "OpenAI API",
                "endpoint_url": "https://api.openai.com/v1/models",
                "endpoint_status": "verified",
                "status": "completed",
                "status_message": "Completed with score 95.0",
                "assessment_score": 95.0,
                "assessment_coverage": 100.0,
                "earned_points": 95.0,
                "assessed_points": 100.0,
                "passed_checks": 8,
                "failed_checks": 0,
                "warning_checks": 0,
                "inconclusive_checks": 0,
                "highest_severity": None,
                "started_at": "2026-11-16T12:00:00Z",
                "completed_at": "2026-11-16T12:00:01Z",
                "duration_ms": 1000.0,
                "findings_count_by_severity": {},
                "test_results": {},
                "findings": [],
                "security_assessment_verified": True,
                "auth_required_noted": False,
            }
        else:
            raise RuntimeError("Network route failure to host")

    with patch("app.services.alternative_scan_service.scan_single_alternative", side_effect=fake_scan):
        batch_res = await scan_selected_alternatives(
            scan_id="scan-123",
            alternative_ids=["openai-api", "failing-provider"],
            db=mock_db,
        )

        assert batch_res["total_scanned"] == 2
        results = {r["alternative_id"]: r for r in batch_res["results"]}

        # OpenAI succeeded
        assert results["openai-api"]["status"] == "completed"
        assert results["openai-api"]["assessment_score"] == 95.0

        # Broken API isolated and captured as failure, not crashing batch
        assert results["failing-provider"]["status"] == "failed"
        assert "Network route failure" in results["failing-provider"]["status_message"]

        # Database commit called to persist results
        assert mock_db.commit.called
        saved_data = json.loads(mock_scan.result_json)
        assert "alternative_scans" in saved_data
        assert "openai-api" in saved_data["alternative_scans"]


# ── 7. API Endpoints Integration ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_route_scan_alternatives():
    """Test POST /api/scans/{scan_id}/alternatives/scan endpoint."""
    mock_scan_data = {
        "scan_id": "test-route-scan",
        "total_scanned": 1,
        "results": [{
            "alternative_id": "openai-api",
            "provider_name": "OpenAI",
            "api_name": "OpenAI API",
            "endpoint_url": "https://api.openai.com/v1/models",
            "endpoint_status": "verified",
            "status": "completed",
            "status_message": "Assessment completed",
            "assessment_score": 92.5,
            "assessment_coverage": 100.0,
            "earned_points": 92.5,
            "assessed_points": 100.0,
            "passed_checks": 7,
            "failed_checks": 1,
            "warning_checks": 0,
            "inconclusive_checks": 0,
            "highest_severity": "low",
            "started_at": "2026-11-16T12:00:00Z",
            "completed_at": "2026-11-16T12:00:01Z",
            "duration_ms": 1250.0,
            "findings_count_by_severity": {"low": 1},
            "test_results": {},
            "findings": [{"check": "Server Header", "severity": "low", "status": "warning"}],
            "security_assessment_verified": True,
            "auth_required_noted": False,
        }]
    }

    with patch("app.services.alternative_scan_service.scan_selected_alternatives", new_callable=AsyncMock, return_value=mock_scan_data):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/scans/test-route-scan/alternatives/scan",
                json={"alternative_ids": ["openai-api"]},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["scan_id"] == "test-route-scan"
            assert data["total_scanned"] == 1
            assert data["results"][0]["alternative_id"] == "openai-api"
            assert data["results"][0]["assessment_score"] == 92.5


@pytest.mark.asyncio
async def test_api_route_list_alternative_scans():
    """Test GET /api/scans/{scan_id}/alternatives/scans endpoint."""
    mock_list_data = {
        "scan_id": "test-route-scan",
        "total_scanned": 1,
        "results": [{
            "alternative_id": "openai-api",
            "provider_name": "OpenAI",
            "api_name": "OpenAI API",
            "endpoint_url": "https://api.openai.com/v1/models",
            "endpoint_status": "verified",
            "status": "completed",
            "status_message": "Assessment completed",
            "assessment_score": 92.5,
            "assessment_coverage": 100.0,
            "earned_points": 92.5,
            "assessed_points": 100.0,
            "passed_checks": 7,
            "failed_checks": 1,
            "warning_checks": 0,
            "inconclusive_checks": 0,
            "highest_severity": "low",
            "started_at": "2026-11-16T12:00:00Z",
            "completed_at": "2026-11-16T12:00:01Z",
            "duration_ms": 1250.0,
            "findings_count_by_severity": {"low": 1},
            "test_results": {},
            "findings": [],
            "security_assessment_verified": True,
            "auth_required_noted": False,
        }]
    }

    with patch("app.services.alternative_scan_service.get_alternative_scans", new_callable=AsyncMock, return_value=mock_list_data):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/scans/test-route-scan/alternatives/scans")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["results"]) == 1
            assert data["results"][0]["alternative_id"] == "openai-api"
