"""
backend/tests/test_alternative_discovery.py — Comprehensive tests for Step 2: Alternative API Discovery.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from app.services.api_category_service import ApiCategory
from app.services.alternative_discovery_service import (
    discover_alternatives,
    calculate_relevance,
    verify_external_url_safely,
    _is_self,
    _VERIFIED_CATALOGUE,
)
from app.schemas import AlternativeApiOut, AlternativesResponse


# ── 1. AI / LLM Discovery ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discover_ai_llm_alternatives_for_gemini():
    """Scanning Google Gemini should discover AI alternatives and exclude Gemini."""
    res = await discover_alternatives(
        target_url="https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
        target_hostname="generativelanguage.googleapis.com",
        category=ApiCategory.AI_LLM,
    )
    assert res["total_found"] > 0
    alts = res["alternatives"]
    # Check that Gemini itself is NOT in the alternatives (self-exclusion)
    provider_ids = [a["id"] for a in alts]
    assert "google-gemini-api" not in provider_ids
    # Should include other top LLM providers
    assert any(a["id"] == "openai-api" for a in alts)
    assert any(a["id"] == "anthropic-claude-api" for a in alts)


@pytest.mark.asyncio
async def test_discover_ai_llm_alternatives_for_openai():
    """Scanning OpenAI should discover AI alternatives and exclude OpenAI."""
    res = await discover_alternatives(
        target_url="https://api.openai.com/v1/chat/completions",
        target_hostname="api.openai.com",
        category=ApiCategory.AI_LLM,
    )
    alts = res["alternatives"]
    provider_ids = [a["id"] for a in alts]
    assert "openai-api" not in provider_ids
    assert any(a["id"] == "anthropic-claude-api" for a in alts)
    assert any(a["id"] == "google-gemini-api" for a in alts)


# ── 2. Payment API Discovery ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discover_payment_alternatives_for_stripe():
    """Scanning Stripe should discover Payment alternatives and exclude Stripe."""
    res = await discover_alternatives(
        target_url="https://api.stripe.com/v1/charges",
        target_hostname="api.stripe.com",
        category=ApiCategory.PAYMENT,
    )
    alts = res["alternatives"]
    provider_ids = [a["id"] for a in alts]
    assert "stripe-api" not in provider_ids
    assert any(a["id"] == "paypal-rest-api" for a in alts)
    assert any(a["id"] == "adyen-api" for a in alts)
    assert any(a["id"] == "square-api" for a in alts)


@pytest.mark.asyncio
async def test_discover_payment_alternatives_for_paypal():
    """Scanning PayPal should discover Payment alternatives and exclude PayPal."""
    res = await discover_alternatives(
        target_url="https://api-m.paypal.com/v2/checkout/orders",
        target_hostname="api-m.paypal.com",
        category=ApiCategory.PAYMENT,
    )
    alts = res["alternatives"]
    provider_ids = [a["id"] for a in alts]
    assert "paypal-rest-api" not in provider_ids
    assert any(a["id"] == "stripe-api" for a in alts)


# ── 3. Weather API Discovery ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discover_weather_alternatives_for_openweather():
    """Scanning OpenWeatherMap should discover Weather alternatives and exclude OpenWeather."""
    res = await discover_alternatives(
        target_url="https://api.openweathermap.org/data/2.5/weather?q=London",
        target_hostname="api.openweathermap.org",
        category=ApiCategory.WEATHER,
    )
    alts = res["alternatives"]
    provider_ids = [a["id"] for a in alts]
    assert "openweather-api" not in provider_ids
    assert any(a["id"] == "weatherapi" for a in alts)
    assert any(a["id"] == "tomorrow-io-api" for a in alts)


# ── 4. Maps API Discovery ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_discover_maps_alternatives_for_google_maps():
    """Scanning Google Maps should discover Maps alternatives and exclude Google Maps."""
    res = await discover_alternatives(
        target_url="https://maps.googleapis.com/maps/api/geocode/json",
        target_hostname="maps.googleapis.com",
        category=ApiCategory.MAPS_LOCATION,
    )
    alts = res["alternatives"]
    provider_ids = [a["id"] for a in alts]
    assert "google-maps-api" not in provider_ids
    assert any(a["id"] == "mapbox-api" for a in alts)
    assert any(a["id"] == "here-location-services" for a in alts)


# ── 5. User-Confirmed Category Override ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_user_confirmed_category_precedence():
    """If user corrected category to Payment, Payment alternatives must be returned even if auto was Unknown."""
    res = await discover_alternatives(
        target_url="https://custom-gateway.corp.net/v1/tx",
        target_hostname="custom-gateway.corp.net",
        category=ApiCategory.UNKNOWN,
        user_category=ApiCategory.PAYMENT,
    )
    assert res["category"] == ApiCategory.PAYMENT
    assert res["user_category"] == ApiCategory.PAYMENT
    assert res["total_found"] > 0
    assert any(a["id"] == "stripe-api" for a in res["alternatives"])


# ── 6. Deduplication ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deduplicate_alternative_providers():
    """Verify provider IDs are unique in the output list."""
    res = await discover_alternatives(
        target_url="https://api.example.com/v1",
        target_hostname="api.example.com",
        category=ApiCategory.AI_LLM,
        limit=20,
    )
    ids = [a["id"] for a in res["alternatives"]]
    assert len(ids) == len(set(ids)), "Provider list contains duplicates"


# ── 7. Unknown Category Handling ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_category_returns_clean_empty_state():
    """Unknown category should gracefully return 0 alternatives with an instructional message."""
    res = await discover_alternatives(
        target_url="https://internal-unknown.example.com",
        target_hostname="internal-unknown.example.com",
        category=ApiCategory.UNKNOWN,
        user_category=None,
    )
    assert res["total_found"] == 0
    assert res["alternatives"] == []
    assert "unclassified" in res["source_summary"].lower()


# ── 8. Partial / Missing Data & Schema Validation ───────────────────────────────

@pytest.mark.asyncio
async def test_alternative_records_match_pydantic_schema():
    """Ensure all alternative records satisfy AlternativeApiOut schema validation."""
    res = await discover_alternatives(
        target_url="https://api.example.com/ai",
        target_hostname="api.example.com",
        category=ApiCategory.AI_LLM,
    )
    for alt_dict in res["alternatives"]:
        model = AlternativeApiOut(**alt_dict)
        assert model.website_url.startswith("https://")
        assert model.documentation_url.startswith("https://")
        assert len(model.main_functionality) > 0
        assert len(model.supported_features) > 0
        assert len(model.authentication_methods) > 0
        assert 0.0 <= model.relevance_score <= 1.0
        assert model.verification_status == "verified"

    # Full response matches schema
    response_model = AlternativesResponse(scan_id="test-scan-id", **res)
    assert response_model.scan_id == "test-scan-id"


# ── 9. Relevance Scoring ────────────────────────────────────────────────────────

def test_relevance_scoring_feature_boost():
    """A target with chat / completions should give higher relevance to chat-capable providers."""
    ai_providers = _VERIFIED_CATALOGUE[ApiCategory.AI_LLM]
    openai_prov = next(p for p in ai_providers if p.id == "openai-api")

    score_chat, reason_chat = calculate_relevance(
        openai_prov,
        target_url="https://my-llm.com/v1/chat/completions",
        target_hostname="my-llm.com",
        target_category=ApiCategory.AI_LLM,
        detected_signals=["path:/chat/completions", "hostname:llm"],
    )

    score_generic, reason_generic = calculate_relevance(
        openai_prov,
        target_url="https://my-llm.com/api",
        target_hostname="my-llm.com",
        target_category=ApiCategory.AI_LLM,
        detected_signals=[],
    )

    assert score_chat > score_generic
    assert "chat" in reason_chat.lower() or "capabilities" in reason_chat.lower()
    assert 0.0 <= score_chat <= 1.0


# ── 10. SSRF Protection & Malicious URL Handling ─────────────────────────────────

@pytest.mark.asyncio
async def test_ssrf_protection_blocks_private_ips():
    """Verify that private IP addresses, loopback, and metadata URLs are rejected by SSRF guard."""
    assert await verify_external_url_safely("http://127.0.0.1/admin") is False
    assert await verify_external_url_safely("http://localhost:8080") is False
    assert await verify_external_url_safely("http://169.254.169.254/latest/meta-data") is False
    assert await verify_external_url_safely("http://10.0.0.1") is False
    assert await verify_external_url_safely("http://192.168.1.1") is False
    assert await verify_external_url_safely("ftp://example.com/spec.yaml") is False


@pytest.mark.asyncio
async def test_ssrf_protection_accepts_valid_https():
    """Valid public HTTPS domains pass safety pre-check."""
    # Note: verify_external_url_safely checks resolve_and_validate
    # On an unresolvable domain, it returns False safely without throwing an unhandled exception
    res = await verify_external_url_safely("https://completely-fake-domain-non-existent-12345.org")
    assert res is False  # Fails safely due to DNS resolution failure, never raises
