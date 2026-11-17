"""
tests/test_api_category.py — Tests for the API category classification service.
"""
from __future__ import annotations

import pytest
from app.services.api_category_service import (
    ALL_CATEGORIES,
    ApiCategory,
    classify_api,
    classify_api_from_result_json,
    validate_manual_category,
)


# ── 1. Known-brand AI / LLM tests ──────────────────────────────────────────────

def test_gemini_classified_as_ai_llm():
    result = classify_api("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro")
    assert result.category == ApiCategory.AI_LLM
    assert result.confidence > 0.7


def test_openai_classified_as_ai_llm():
    result = classify_api("https://api.openai.com/v1/chat/completions")
    assert result.category == ApiCategory.AI_LLM
    assert result.confidence > 0.7


def test_anthropic_classified_as_ai_llm():
    result = classify_api("https://api.anthropic.com/v1/messages")
    assert result.category == ApiCategory.AI_LLM
    assert result.confidence > 0.65


# ── 2. Payment ──────────────────────────────────────────────────────────────────

def test_stripe_classified_as_payment():
    result = classify_api("https://api.stripe.com/v1/charges")
    assert result.category == ApiCategory.PAYMENT
    assert result.confidence > 0.7


def test_paypal_classified_as_payment():
    result = classify_api("https://api.paypal.com/v1/payments/payment")
    assert result.category == ApiCategory.PAYMENT
    assert result.confidence > 0.7


# ── 3. Weather ──────────────────────────────────────────────────────────────────

def test_openweather_classified_as_weather():
    result = classify_api("https://api.openweathermap.org/data/2.5/weather?q=London")
    assert result.category == ApiCategory.WEATHER
    assert result.confidence > 0.65


def test_weatherapi_hostname():
    result = classify_api("https://api.weatherapi.com/v1/forecast.json")
    assert result.category == ApiCategory.WEATHER


# ── 4. Maps / Location ──────────────────────────────────────────────────────────

def test_google_maps_classified_as_maps():
    result = classify_api("https://maps.googleapis.com/maps/api/geocode/json")
    assert result.category == ApiCategory.MAPS_LOCATION
    assert result.confidence > 0.7


def test_mapbox_classified_as_maps():
    result = classify_api("https://api.mapbox.com/geocoding/v5/mapbox.places/Berlin.json")
    assert result.category == ApiCategory.MAPS_LOCATION


# ── 5. Unknown when evidence is insufficient ────────────────────────────────────

def test_unknown_domain_returns_unknown():
    result = classify_api("https://totally-random-xk928.example.com/api/data")
    assert result.category == ApiCategory.UNKNOWN
    assert result.confidence == 0.0
    assert result.requires_user_confirmation is True


def test_generic_api_returns_unknown():
    result = classify_api("https://backend.acme-internal.io/v1/users")
    assert result.category == ApiCategory.UNKNOWN or result.requires_user_confirmation is True


# ── 6. Low confidence triggers user confirmation ────────────────────────────────

def test_low_confidence_triggers_confirmation():
    # A URL with weak signals (only a path hint, no specific hostname)
    result = classify_api("https://corp.example.com/weather/today")
    # Either unknown or requires confirmation
    assert result.requires_user_confirmation is True or result.category == ApiCategory.UNKNOWN


# ── 7. Spec metadata improves classification ────────────────────────────────────

def test_spec_title_boosts_classification():
    result = classify_api(
        "https://backend.example.com/api/v1",
        spec_title="Stripe Payments API",
        spec_description="Process charges, refunds and payouts.",
    )
    assert result.category == ApiCategory.PAYMENT


def test_endpoint_paths_from_spec():
    result = classify_api(
        "https://backend.example.com/api/v1",
        spec_endpoints=["/v1/chat/completions", "/v1/models"],
        spec_title="LLM Inference Service",
    )
    assert result.category == ApiCategory.AI_LLM


# ── 8. Manual category correction validation ────────────────────────────────────

def test_valid_manual_category_accepted():
    validated = validate_manual_category(ApiCategory.PAYMENT)
    assert validated == ApiCategory.PAYMENT


def test_invalid_manual_category_raises():
    with pytest.raises(ValueError, match="Invalid category"):
        validate_manual_category("Blockchain API")


def test_all_categories_valid():
    for cat in ALL_CATEGORIES:
        assert validate_manual_category(cat) == cat


# ── 9. classify_api_from_result_json convenience wrapper ───────────────────────

def test_classify_from_result_json_no_context():
    result = classify_api_from_result_json("https://api.stripe.com/v1/invoices")
    assert result.category == ApiCategory.PAYMENT


def test_classify_from_result_json_with_operation_context():
    result_json = {
        "url": "https://backend.acme.com/api",
        "operation_context": {
            "spec_title": "OpenAI API",
            "path": "/v1/completions",
            "description": "Create a text completion.",
        },
    }
    result = classify_api_from_result_json(
        "https://backend.acme.com/api/v1/completions",
        result_json_dict=result_json,
    )
    assert result.category == ApiCategory.AI_LLM


# ── 10. Reason and detection_method are non-empty for known APIs ────────────────

def test_result_contains_reason_and_method():
    result = classify_api("https://api.stripe.com/v1/charges")
    assert len(result.reason) > 0
    assert len(result.detection_method) > 0
    assert len(result.matched_signals) > 0


def test_unknown_has_zero_confidence():
    result = classify_api("https://totally-random-xk928.example.com/api")
    assert result.confidence == 0.0


# ── 11. Result structure ────────────────────────────────────────────────────────

def test_result_structure():
    result = classify_api("https://api.openai.com/v1/chat/completions")
    assert hasattr(result, 'category')
    assert hasattr(result, 'confidence')
    assert hasattr(result, 'reason')
    assert hasattr(result, 'detection_method')
    assert hasattr(result, 'requires_user_confirmation')
    assert hasattr(result, 'matched_signals')
    assert isinstance(result.matched_signals, list)
    assert 0.0 <= result.confidence <= 1.0
