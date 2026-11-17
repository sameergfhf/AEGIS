"""Mocked tests for live directory parsing and safe fallback behavior."""
from __future__ import annotations

import pytest

from app.services import live_api_discovery_service as live
from app.services.alternative_discovery_service import discover_alternatives
from app.services.api_category_service import ApiCategory, classify_api


def _entry(title: str, domain: str, *, docs: str = "https://docs.example.org/api"):
    return {
        "preferred": "v1",
        "versions": {
            "v1": {
                "swaggerUrl": "https://spec.example.org/openapi.json",
                "info": {"title": title, "description": f"{title} API for online payments and billing", "externalDocs": {"url": docs}},
            }
        },
    }


@pytest.fixture(autouse=True)
def _clear_cache():
    live.clear_caches()
    yield
    live.clear_caches()


@pytest.mark.asyncio
async def test_parses_apis_guru_version_metadata_and_marks_endpoint_unverified(monkeypatch):
    async def directory(force=False):
        return {
            "pay.example.com": _entry("Pay Example API", "pay.example.com"),
            "stripe.com": _entry("Stripe API", "stripe.com"),
        }, False, "2026-01-01T00:00:00+00:00"

    monkeypatch.setattr(live, "_get_directory", directory)
    monkeypatch.setattr(live, "_provider_domains", {"pay.example.com", "stripe.com"})
    monkeypatch.setattr(live, "_category_confidence", lambda item, category, provider="": 0.8)
    result = await live.discover_live(ApiCategory.PAYMENT, "api.stripe.com")
    assert len(result["alternatives"]) == 1
    candidate = result["alternatives"][0]
    assert candidate["api_name"] == "Pay Example API"
    assert candidate["api_endpoint_url"] is None
    assert candidate["endpoint_status"] == "endpoint_unverified"
    assert candidate["authentication_methods"] == []
    assert candidate["pricing_model"] is None


@pytest.mark.asyncio
async def test_category_cache_is_target_neutral_and_excludes_current_provider(monkeypatch):
    calls = 0

    async def directory(force=False):
        nonlocal calls
        calls += 1
        return {"stripe.com": _entry("Stripe API", "stripe.com"), "pay.example.com": _entry("Pay Example API", "pay.example.com")}, False, "2026-01-01T00:00:00+00:00"

    monkeypatch.setattr(live, "_get_directory", directory)
    monkeypatch.setattr(live, "_provider_domains", {"stripe.com", "pay.example.com"})
    monkeypatch.setattr(live, "_category_confidence", lambda item, category, provider="": 0.8)
    first = await live.discover_live(ApiCategory.PAYMENT, "api.stripe.com")
    second = await live.discover_live(ApiCategory.PAYMENT, "pay.example.com")
    assert [a["provider_name"] for a in first["alternatives"]] == ["pay.example.com"]
    assert [a["provider_name"] for a in second["alternatives"]] == ["stripe.com"]
    assert second["is_cached"] is True
    assert calls == 1


@pytest.mark.asyncio
async def test_manual_refresh_bypasses_category_cache(monkeypatch):
    calls = 0

    async def directory(force=False):
        nonlocal calls
        calls += 1
        return {"pay.example.com": _entry("Pay Example API", "pay.example.com")}, False, "2026-01-01T00:00:00+00:00"

    monkeypatch.setattr(live, "_get_directory", directory)
    monkeypatch.setattr(live, "_provider_domains", {"pay.example.com"})
    monkeypatch.setattr(live, "_category_confidence", lambda item, category, provider="": 0.8)
    await live.discover_live(ApiCategory.PAYMENT, "stripe.com")
    await live.discover_live(ApiCategory.PAYMENT, "stripe.com", force=True)
    assert calls == 2


@pytest.mark.asyncio
async def test_expired_category_cache_is_reloaded(monkeypatch):
    calls = 0

    async def directory(force=False):
        nonlocal calls
        calls += 1
        return {"pay.example.com": _entry("Pay Example API", "pay.example.com")}, False, "2026-01-01T00:00:00+00:00"

    monkeypatch.setattr(live, "_get_directory", directory)
    monkeypatch.setattr(live, "_provider_domains", {"pay.example.com"})
    monkeypatch.setattr(live, "_category_confidence", lambda item, category, provider="": 0.8)
    await live.discover_live(ApiCategory.PAYMENT, "stripe.com")
    timestamp, entries = live._category_cache[ApiCategory.PAYMENT]
    live._category_cache[ApiCategory.PAYMENT] = (timestamp - live.CATEGORY_TTL - 1, entries)
    refreshed = await live.discover_live(ApiCategory.PAYMENT, "stripe.com")
    assert calls == 2
    assert refreshed["is_cached"] is False


@pytest.mark.asyncio
async def test_invalid_docs_urls_are_not_returned_as_clickable_links(monkeypatch):
    async def directory(force=False):
        return {"pay.example.com": _entry("Pay Example API", "pay.example.com", docs="javascript:alert(1)")}, False, "2026-01-01T00:00:00+00:00"

    monkeypatch.setattr(live, "_get_directory", directory)
    monkeypatch.setattr(live, "_provider_domains", {"pay.example.com"})
    monkeypatch.setattr(live, "_category_confidence", lambda item, category, provider="": 0.8)
    result = await live.discover_live(ApiCategory.PAYMENT, "stripe.com")
    assert result["alternatives"][0]["documentation_url"] == "https://spec.example.org/openapi.json"


@pytest.mark.asyncio
async def test_unavailable_live_directory_returns_local_recommendations(monkeypatch):
    async def unavailable(*args, **kwargs):
        raise RuntimeError("simulated directory timeout")

    monkeypatch.setattr(live, "discover_live", unavailable)
    result = await discover_alternatives(
        target_url="https://api.stripe.com/v1/charges",
        target_hostname="api.stripe.com",
        category=ApiCategory.PAYMENT,
        limit=5,
        include_live=True,
    )
    assert result["alternatives"]
    assert all(item["discovery_source"] == "local_catalogue" for item in result["alternatives"])
    assert result["warnings"]


@pytest.mark.asyncio
async def test_directory_rate_limit_falls_back_to_previous_snapshot(monkeypatch):
    old_snapshot = {"pay.example.com": _entry("Pay Example API", "pay.example.com")}
    live._directory = live.DirectorySnapshot(fetched_at=1, entries=old_snapshot)

    async def rate_limited(url, *, max_bytes=live.MAX_BODY_BYTES):
        raise RuntimeError("simulated HTTP 429")

    monkeypatch.setattr(live, "_safe_fetch_json", rate_limited)
    snapshot, was_cached, retrieved_at = await live._get_directory(force=True)
    assert snapshot is old_snapshot
    assert was_cached is True
    assert retrieved_at


@pytest.mark.asyncio
async def test_malformed_directory_fails_closed_without_cached_data(monkeypatch):
    async def malformed(url, *, max_bytes=live.MAX_BODY_BYTES):
        return []

    monkeypatch.setattr(live, "_safe_fetch_json", malformed)
    with pytest.raises(ValueError):
        await live._get_directory(force=True)


@pytest.mark.asyncio
async def test_unsafe_or_unapproved_directory_urls_are_rejected_before_fetch(monkeypatch):
    def unsafe_resolve(url):
        raise AssertionError("URL validation should not run for non-allowlisted source")

    monkeypatch.setattr(live, "resolve_and_validate", unsafe_resolve)
    with pytest.raises(ValueError):
        await live._safe_fetch_json("https://attacker.example/list.json")


def test_url_normalizer_rejects_credentials_and_non_https():
    assert live._safe_https_url("http://docs.example.org") is None
    assert live._safe_https_url("https://user:pass@docs.example.org/api") is None
    assert live._safe_https_url("https://docs.example.org/api") == "https://docs.example.org/api"


def test_category_classifier_recognizes_github_as_general_rest():
    result = classify_api("https://api.github.com/repos/openai/codex")
    assert result.category == ApiCategory.GENERAL_REST
    assert result.confidence >= 0.4
