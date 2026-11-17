"""
backend/tests/test_api_comparison.py — Comprehensive tests for Step 4:
Intelligent API Comparison and Recommendation Engine.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.scan import Scan
from app.services.api_comparison_service import (
    DEFAULT_WEIGHTS,
    _classify_coverage,
    _evaluate_functional_compatibility,
    _evaluate_security_eligibility,
    _calculate_composite_score,
    _generate_recommendation_label,
    generate_api_comparison,
)
from app.services.report_service import generate_pdf


# ── 1. Coverage Classification Policy ───────────────────────────────────────────

def test_classify_coverage_policy():
    assert _classify_coverage(100.0) == "sufficient"
    assert _classify_coverage(80.0) == "sufficient"
    assert _classify_coverage(79.9) == "provisional"
    assert _classify_coverage(50.0) == "provisional"
    assert _classify_coverage(49.9) == "insufficient"
    assert _classify_coverage(10.0) == "insufficient"
    assert _classify_coverage(0.0) == "not_assessed"


# ── 2. Functional Compatibility Evaluation ──────────────────────────────────────

def test_functional_compatibility_high_match():
    alt = {
        "category": "AI / LLM API",
        "relevance_score": 0.90,
        "supported_features": ["chat", "embeddings"],
        "authentication_methods": ["Bearer Token"],
        "compatibility_notes": "Mirror endpoints supported.",
    }
    level, reason = _evaluate_functional_compatibility(alt, baseline_category="AI / LLM API")
    assert level == "high"
    assert "Strong category match" in reason
    assert "Bearer Token" in reason


def test_functional_compatibility_partial_and_low():
    # Partial: same category, moderate relevance
    alt_partial = {"category": "Payment API", "relevance_score": 0.50}
    level, _ = _evaluate_functional_compatibility(alt_partial, baseline_category="Payment API")
    assert level == "partial"

    # Low: low relevance
    alt_low = {"category": "General REST API", "relevance_score": 0.20}
    level, _ = _evaluate_functional_compatibility(alt_low, baseline_category="AI / LLM API")
    assert level == "low"


# ── 3. Security Eligibility Gate ───────────────────────────────────────────────

def test_security_eligibility_passes_when_clean_and_superior():
    alt_scan = {
        "status": "completed",
        "assessment_score": 92.0,
        "assessment_coverage": 100.0,
        "findings_count_by_severity": {"critical": 0, "high": 0},
    }
    is_eligible, reasons = _evaluate_security_eligibility(alt_scan, baseline_score=84.0)
    assert is_eligible is True


def test_security_eligibility_fails_on_critical_findings():
    """Even if an alternative scores 98/100, having a critical finding disqualifies it."""
    alt_scan = {
        "status": "completed",
        "assessment_score": 98.0,
        "assessment_coverage": 100.0,
        "findings_count_by_severity": {"critical": 1, "high": 0},
    }
    is_eligible, reasons = _evaluate_security_eligibility(alt_scan, baseline_score=84.0)
    assert is_eligible is False
    assert any("critical" in r.lower() for r in reasons)


def test_security_eligibility_fails_on_provisional_coverage():
    """Coverage below 80% cannot receive strong security recommendation."""
    alt_scan = {
        "status": "completed",
        "assessment_score": 95.0,
        "assessment_coverage": 70.0,
        "findings_count_by_severity": {"critical": 0},
    }
    is_eligible, reasons = _evaluate_security_eligibility(alt_scan, baseline_score=84.0)
    assert is_eligible is False
    assert any("coverage" in r.lower() for r in reasons)


def test_security_eligibility_fails_when_score_lower_than_baseline():
    """An alternative that scored lower than original is not eligible as a security upgrade."""
    alt_scan = {
        "status": "completed",
        "assessment_score": 75.0,
        "assessment_coverage": 100.0,
        "findings_count_by_severity": {"critical": 0},
    }
    is_eligible, reasons = _evaluate_security_eligibility(alt_scan, baseline_score=84.0)
    assert is_eligible is False
    assert any("does not exceed" in r.lower() for r in reasons)


# ── 4. Composite Recommendation Scoring ─────────────────────────────────────────

def test_composite_score_calculation_honesty():
    alt = {
        "relevance_score": 0.85,
        "openapi_spec_url": "https://example.com/spec.json",
        "api_endpoint_url": "https://api.example.com",
        "documentation_url": "https://example.com/docs",
    }
    alt_scan = {
        "assessment_score": 90.0,
        "assessment_coverage": 100.0,
    }
    composite = _calculate_composite_score(
        alt, alt_scan, compatibility_level="high", pricing_status="verified", weights=DEFAULT_WEIGHTS
    )
    assert composite is not None
    assert 80.0 <= composite <= 95.0


def test_composite_score_none_when_unscanned():
    """Unscanned alternatives MUST NOT be assigned a fabricated composite score."""
    alt = {"relevance_score": 0.85}
    composite = _calculate_composite_score(
        alt, None, compatibility_level="high", pricing_status="unverified", weights=DEFAULT_WEIGHTS
    )
    assert composite is None


# ── 5. End-to-End Comparison Service Tests ──────────────────────────────────────

@pytest.mark.asyncio
async def test_comparison_when_alternative_is_superior():
    """When an alternative is genuinely scanned and superior, it receives 'Best Overall Match'."""
    mock_scan = MagicMock(spec=Scan)
    mock_scan.id = "scan-comp-1"
    mock_scan.hostname = "api.baseline.com"
    mock_scan.url = "https://api.baseline.com/v1"
    mock_scan.status = "completed"
    mock_scan.assessment_score = 80.0
    mock_scan.assessment_coverage = 100.0
    mock_scan.earned_points = 80.0
    mock_scan.assessed_points = 100.0
    mock_scan.passed_checks = 6
    mock_scan.failed_checks = 2
    mock_scan.warning_checks = 0
    mock_scan.inconclusive_checks = 0
    mock_scan.highest_severity = "medium"

    result_json = {
        "api_category": {"category": "AI / LLM API", "user_category": None},
        "test_results": {
            "tls": {"name": "TLS", "earned_points": 30.0, "max_points": 30.0, "status": "pass"},
            "headers": {"name": "Headers", "earned_points": 10.0, "max_points": 20.0, "status": "warning"},
            "leakage": {"name": "Leakage", "earned_points": 20.0, "max_points": 25.0, "status": "pass"},
            "reputation": {"name": "Reputation", "earned_points": 20.0, "max_points": 25.0, "status": "pass"},
        },
        "alternatives": {
            "category": "AI / LLM API",
            "alternatives": [
                {
                    "id": "openai-api",
                    "provider_name": "OpenAI",
                    "api_name": "OpenAI REST API",
                    "category": "AI / LLM API",
                    "relevance_score": 0.95,
                    "pricing_model": "Usage-based per token",
                    "pricing_url": "https://openai.com/pricing",
                    "documentation_url": "https://platform.openai.com/docs",
                    "api_endpoint_url": "https://api.openai.com/v1/models",
                    "endpoint_status": "verified",
                }
            ],
        },
        "alternative_scans": {
            "openai-api": {
                "status": "completed",
                "assessment_score": 96.0,
                "assessment_coverage": 100.0,
                "findings_count_by_severity": {"critical": 0, "high": 0, "medium": 1, "low": 0},
                "highest_severity": "medium",
                "test_results": {
                    "tls": {"name": "TLS", "earned_points": 30.0, "max_points": 30.0, "status": "pass"},
                    "headers": {"name": "Headers", "earned_points": 16.0, "max_points": 20.0, "status": "pass"},
                    "leakage": {"name": "Leakage", "earned_points": 25.0, "max_points": 25.0, "status": "pass"},
                    "reputation": {"name": "Reputation", "earned_points": 25.0, "max_points": 25.0, "status": "pass"},
                },
            }
        },
    }
    mock_scan.result_json = json.dumps(result_json)

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_scan
    mock_db.execute.return_value = mock_res

    res = await generate_api_comparison("scan-comp-1", db=mock_db, force_recalculate=True)

    assert res["scan_id"] == "scan-comp-1"
    assert res["baseline"]["assessment_score"] == 80.0
    assert len(res["alternatives"]) == 1

    alt = res["alternatives"][0]
    assert alt["id"] == "openai-api"
    assert alt["assessment_score"] == 96.0
    assert alt["score_difference"] == 16.0  # 96 - 80
    assert alt["recommendation_label"] == "Best Overall Match"
    assert alt["is_security_eligible"] is True
    assert "OpenAI" in res["summary"]["headline"]
    assert res["summary"]["best_match_id"] == "openai-api"


@pytest.mark.asyncio
async def test_comparison_conclusion_when_original_is_superior():
    """
    When original API score is 95 and all alternatives score lower,
    AEGIS must conclude: 'No alternative is demonstrably better based on the available evidence.'
    """
    mock_scan = MagicMock(spec=Scan)
    mock_scan.id = "scan-comp-superior"
    mock_scan.hostname = "api.stripe.com"
    mock_scan.url = "https://api.stripe.com/v1"
    mock_scan.status = "completed"
    mock_scan.assessment_score = 95.0
    mock_scan.assessment_coverage = 100.0
    mock_scan.earned_points = 95.0
    mock_scan.assessed_points = 100.0

    result_json = {
        "api_category": {"category": "Payment API"},
        "test_results": {},
        "alternatives": {
            "category": "Payment API",
            "alternatives": [
                {
                    "id": "alt-payment-api",
                    "provider_name": "AltPay",
                    "api_name": "AltPay Gateway",
                    "category": "Payment API",
                    "relevance_score": 0.85,
                }
            ],
        },
        "alternative_scans": {
            "alt-payment-api": {
                "status": "completed",
                "assessment_score": 82.0,  # Lower than 95.0!
                "assessment_coverage": 100.0,
                "findings_count_by_severity": {"critical": 0},
                "test_results": {},
            }
        },
    }
    mock_scan.result_json = json.dumps(result_json)

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_scan
    mock_db.execute.return_value = mock_res

    res = await generate_api_comparison("scan-comp-superior", db=mock_db, force_recalculate=True)

    alt = res["alternatives"][0]
    assert alt["score_difference"] == -13.0  # 82 - 95
    assert alt["recommendation_label"] != "Best Overall Match"

    # Strict honest conclusion:
    assert "No alternative is demonstrably better" in res["summary"]["overall_conclusion"]
    assert res["summary"]["best_match_id"] is None


@pytest.mark.asyncio
async def test_comparison_with_unscanned_alternatives():
    """Unscanned alternatives must show scan_status 'not_assessed' and score None."""
    mock_scan = MagicMock(spec=Scan)
    mock_scan.id = "scan-unscanned"
    mock_scan.hostname = "api.example.com"
    mock_scan.url = "https://api.example.com"
    mock_scan.status = "completed"
    mock_scan.assessment_score = 85.0
    mock_scan.assessment_coverage = 100.0

    result_json = {
        "api_category": {"category": "Weather API"},
        "alternatives": {
            "category": "Weather API",
            "alternatives": [
                {
                    "id": "openweather-api",
                    "provider_name": "OpenWeatherMap",
                    "api_name": "Current Weather API",
                    "category": "Weather API",
                    "relevance_score": 0.90,
                }
            ],
        },
        "alternative_scans": {},  # Empty! Not scanned yet
    }
    mock_scan.result_json = json.dumps(result_json)

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_scan
    mock_db.execute.return_value = mock_res

    res = await generate_api_comparison("scan-unscanned", db=mock_db, force_recalculate=True)

    alt = res["alternatives"][0]
    assert alt["scan_status"] == "not_assessed"
    assert alt["assessment_score"] is None
    assert alt["recommendation_label"] == "Provisional Candidate"
    assert "Alternative security assessment required" in res["summary"]["headline"]


@pytest.mark.asyncio
async def test_zero_network_probes_guarantee():
    """
    Comparison service MUST NEVER initiate network or socket connections.
    """
    mock_scan = MagicMock(spec=Scan)
    mock_scan.id = "scan-probe-test"
    mock_scan.status = "completed"
    mock_scan.assessment_score = 80.0
    mock_scan.assessment_coverage = 100.0
    mock_scan.result_json = json.dumps({"alternatives": {"alternatives": []}, "alternative_scans": {}})

    mock_db = AsyncMock()
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = mock_scan
    mock_db.execute.return_value = mock_res

    with patch("httpx.AsyncClient") as mock_client:
        await generate_api_comparison("scan-probe-test", db=mock_db, force_recalculate=True)
        # Ensure httpx was NEVER called
        assert not mock_client.called


# ── 6. PDF Report Integration ───────────────────────────────────────────────────

def test_pdf_report_renders_with_comparison_data():
    """PDF report must incorporate the Smart API Comparison section without crashing."""
    mock_scan = MagicMock(spec=Scan)
    mock_scan.id = "12345678-abcd-1234-abcd-1234567890ab"
    mock_scan.url = "https://api.example.com/v1"
    mock_scan.hostname = "api.example.com"
    mock_scan.status = "completed"
    mock_scan.assessment_score = 85.0
    mock_scan.assessment_coverage = 100.0
    mock_scan.earned_points = 85.0
    mock_scan.assessed_points = 100.0
    mock_scan.passed_checks = 6
    mock_scan.failed_checks = 1
    mock_scan.warning_checks = 1
    mock_scan.inconclusive_checks = 0
    mock_scan.highest_severity = "medium"

    result_dict = {
        "test_results": {},
        "comparison": {
            "summary": {
                "headline": "OpenAI achieved higher score (+7.0 pts)",
                "overall_conclusion": "OpenAI demonstrated the strongest posture.",
            },
            "alternatives": [
                {
                    "provider_name": "OpenAI",
                    "assessment_score": 92.0,
                    "score_difference": 7.0,
                    "assessment_coverage": 100.0,
                    "compatibility_level": "high",
                    "recommendation_label": "Best Overall Match",
                    "scan_status": "completed",
                }
            ],
        },
    }
    mock_scan.result_json = json.dumps(result_dict)

    pdf_bytes = generate_pdf(mock_scan)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF")


# ── 7. FastAPI Route Integration ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_comparison_api_route():
    """Test GET /api/scans/{scan_id}/comparison route."""
    mock_comparison = {
        "scan_id": "test-route-comp",
        "generated_at": "2026-11-16T12:00:00Z",
        "baseline": {
            "name": "api.example.com",
            "url": "https://api.example.com",
            "hostname": "api.example.com",
            "category": "AI / LLM API",
            "assessment_score": 85.0,
            "assessment_coverage": 100.0,
            "earned_points": 85.0,
            "assessed_points": 100.0,
            "passed_checks": 6,
            "failed_checks": 1,
            "warning_checks": 1,
            "inconclusive_checks": 0,
            "highest_severity": "low",
            "findings_count_by_severity": {},
            "vector_scores": {},
        },
        "summary": {
            "best_match_id": "openai-api",
            "best_match_name": "OpenAI",
            "headline": "OpenAI is best match",
            "overall_conclusion": "OpenAI scored higher.",
            "total_alternatives_evaluated": 1,
            "total_scanned": 1,
            "total_unscanned": 0,
            "coverage_threshold_policy": ">=80% Strong",
            "weights_applied": {},
        },
        "alternatives": [],
        "comparison_table": [],
        "chart_data": {},
    }

    with patch("app.services.api_comparison_service.generate_api_comparison", new_callable=AsyncMock, return_value=mock_comparison):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/scans/test-route-comp/comparison")
            assert resp.status_code == 200
            data = resp.json()
            assert data["scan_id"] == "test-route-comp"
            assert data["summary"]["best_match_id"] == "openai-api"
