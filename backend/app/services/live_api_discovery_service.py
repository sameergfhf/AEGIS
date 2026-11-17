"""Bounded, cached metadata discovery from the public APIs.guru directory.

Directory metadata is untrusted and is never treated as a verified endpoint,
security result, pricing source, or authentication declaration.
"""
from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpcore
import httpx

from app.security.url_validation import URLValidationError, resolve_and_validate

logger = logging.getLogger(__name__)
DIRECTORY_URL = "https://api.apis.guru/v2/list.json"
PROVIDERS_URL = "https://api.apis.guru/v2/providers.json"
MAX_BODY_BYTES = 20 * 1024 * 1024


def _read_ttl(name: str, default: int) -> int:
    try:
        return max(60, int(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        logger.warning("Invalid %s value; using the default cache duration", name)
        return default


DIRECTORY_TTL = _read_ttl("API_DISCOVERY_DIRECTORY_TTL", 86400)
CATEGORY_TTL = _read_ttl("API_DISCOVERY_CATEGORY_TTL", 10800)


class _PinnedBackend(httpcore.AsyncNetworkBackend):
    """Use the exact public IP validated before connecting; retain URL host for TLS SNI."""
    def __init__(self, host: str, ip: str):
        self.host, self.ip = host.lower(), ip
        from httpcore._backends.auto import AutoBackend
        self.backend = AutoBackend()

    async def connect_tcp(self, host: str, port: int, timeout: float | None = None, local_address: str | None = None, socket_options: Any = None):
        ipaddress.ip_address(self.ip)
        if host.lower().rstrip(".") != self.host.rstrip("."):
            raise httpcore.ConnectError("Connection host does not match the validated discovery origin")
        return await self.backend.connect_tcp(self.ip, port, timeout=timeout, local_address=local_address, socket_options=socket_options)

    async def connect_unix_socket(self, path: str, timeout: float | None = None, socket_options: Any = None):
        raise httpcore.ConnectError("Unix sockets are not permitted for public discovery")

    async def sleep(self, seconds: float) -> None:
        await self.backend.sleep(seconds)


@dataclass
class DirectorySnapshot:
    fetched_at: float
    entries: dict[str, Any]


_directory: DirectorySnapshot | None = None
_provider_domains: set[str] = set()
_directory_lock = asyncio.Lock()
_category_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


async def _safe_fetch_json(url: str, *, max_bytes: int = MAX_BODY_BYTES) -> Any:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "api.apis.guru" or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ValueError("Discovery URL is not an approved HTTPS source")
    _, resolved_ip = await asyncio.to_thread(resolve_and_validate, url)
    transport = httpx.AsyncHTTPTransport(trust_env=False, retries=0)
    # Replace HTTPX's resolver with a pinned connection backend. HTTPS origin host
    # remains the directory hostname, preserving SNI and certificate validation.
    old_pool = transport._pool
    transport._pool = httpcore.AsyncConnectionPool(
        ssl_context=old_pool._ssl_context,
        max_connections=4,
        max_keepalive_connections=2,
        keepalive_expiry=10,
        network_backend=_PinnedBackend(parsed.hostname, resolved_ip),
    )
    await old_pool.aclose()
    try:
        async with httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(8.0, connect=3.0), follow_redirects=False, trust_env=False) as client:
            async with client.stream("GET", url, headers={"Accept": "application/json"}) as response:
                if response.is_redirect:
                    raise ValueError("Redirects are not allowed for the API directory")
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "json" not in content_type.lower():
                    raise ValueError("Directory returned a non-JSON response")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise ValueError("Directory response exceeded the size limit")
        return httpx.Response(200, content=bytes(body)).json()
    finally:
        await transport.aclose()


async def _get_directory(force: bool = False) -> tuple[dict[str, Any], bool, str | None]:
    global _directory, _provider_domains
    async with _directory_lock:
        now = time.time()
        if not force and _directory and now - _directory.fetched_at < DIRECTORY_TTL:
            return _directory.entries, True, datetime.fromtimestamp(_directory.fetched_at, timezone.utc).isoformat()
        try:
            payload = await _safe_fetch_json(DIRECTORY_URL)
            if not isinstance(payload, dict) or not payload:
                raise ValueError("Directory schema was empty or invalid")
            try:
                providers_payload = await _safe_fetch_json(PROVIDERS_URL, max_bytes=2 * 1024 * 1024)
                provider_values = providers_payload.get("data") if isinstance(providers_payload, dict) else None
                if isinstance(provider_values, list) and all(isinstance(value, str) for value in provider_values):
                    _provider_domains = {_normalized_host(value) for value in provider_values}
            except Exception as exc:
                logger.warning("APIs.guru provider index unavailable: %s", type(exc).__name__)
            _directory = DirectorySnapshot(now, payload)
            return payload, False, datetime.fromtimestamp(now, timezone.utc).isoformat()
        except Exception as exc:
            logger.warning("APIs.guru discovery unavailable: %s", type(exc).__name__)
            if _directory:
                return _directory.entries, True, datetime.fromtimestamp(_directory.fetched_at, timezone.utc).isoformat()
            raise


def _normalized_host(value: str) -> str:
    value = value.strip().lower().rstrip(".")
    return value[4:] if value.startswith("www.") else value


def _safe_https_url(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 2048:
        return None
    try:
        parsed = urlparse(value.strip())
        if parsed.scheme.lower() != "https" or not parsed.hostname or parsed.username or parsed.password:
            return None
        return value.strip()
    except ValueError:
        return None


def _category_confidence(item: dict[str, Any], category: str, provider: str = "") -> float:
    versions = item.get("versions") if isinstance(item.get("versions"), dict) else {}
    version = versions.get(item.get("preferred")) if item.get("preferred") else None
    if not isinstance(version, dict) and versions:
        version = next(iter(versions.values()))
    version = version if isinstance(version, dict) else {}
    info = item.get("info") if isinstance(item.get("info"), dict) else version.get("info", {})
    info = info if isinstance(info, dict) else {}
    text = " ".join(str(info.get(key, "")) for key in ("title", "description"))
    provider = str(item.get("provider") or provider)
    from app.services.api_category_service import classify_api
    result = classify_api(f"https://{provider}", spec_title=str(info.get("title", "")), spec_description=text)
    return result.confidence if result.category == category else 0.0


async def discover_live(category: str, target_hostname: str, limit: int = 10, force: bool = False) -> dict[str, Any]:
    """Return category-matched APIs.guru metadata, or raise when no snapshot exists."""
    now = time.time()
    cached = _category_cache.get(category)
    if not force and cached and now - cached[0] < CATEGORY_TTL:
        return {"alternatives": _exclude_target(cached[1], target_hostname)[:limit], "is_cached": True, "retrieved_at": datetime.fromtimestamp(cached[0], timezone.utc).isoformat(), "warning": None}
    directory, directory_cached, retrieved_at = await _get_directory(force=force)
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for key, raw in directory.items():
        if not isinstance(raw, dict):
            continue
        provider = str(raw.get("provider") or key).strip()
        versions = raw.get("versions") if isinstance(raw.get("versions"), dict) else {}
        preferred = raw.get("preferred")
        version = versions.get(preferred) if preferred else None
        if not isinstance(version, dict) and versions:
            version = next(iter(versions.values()))
        version = version if isinstance(version, dict) else {}
        info = raw.get("info") if isinstance(raw.get("info"), dict) else version.get("info", {})
        info = info if isinstance(info, dict) else {}
        title = str(info.get("title", "")).strip()[:200]
        category_confidence = _category_confidence(raw, category, provider)
        if not provider or not title or (_provider_domains and _normalized_host(provider) not in _provider_domains) or category_confidence < 0.40:
            continue
        host = _normalized_host(provider)
        try:
            parsed_host = urlparse(f"https://{host}")
            if parsed_host.hostname != host or not host or parsed_host.port:
                continue
        except ValueError:
            continue
        spec_url = _safe_https_url(version.get("swaggerUrl"))
        identity = host
        if identity in seen:
            continue
        seen.add(identity)
        slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in f"{host}-{title}").strip("-")[:110]
        description = str(info.get("description", "")).strip()[:700]
        external_docs = info.get("externalDocs") if isinstance(info.get("externalDocs"), dict) else {}
        docs = _safe_https_url(external_docs.get("url")) or spec_url
        contact = info.get("contact") if isinstance(info.get("contact"), dict) else {}
        website = _safe_https_url(contact.get("url")) or _safe_https_url(info.get("x-website"))
        output.append({
            "id": f"apisguru-{slug}", "provider_name": provider, "api_name": title,
            "category": category, "description": description or "No description provided by the directory.",
            "website_url": website, "documentation_url": docs,
            "api_endpoint_url": None, "endpoint_status": "endpoint_unverified",
            "main_functionality": description or "Functionality not described by the directory.",
            "supported_features": [], "authentication_methods": [], "pricing_model": None,
            "pricing_details": None, "pricing_url": None, "openapi_spec_url": spec_url,
            "compatibility_notes": "Directory metadata only; endpoint and compatibility are unverified.",
            "source_urls": [DIRECTORY_URL], "verification_status": "unverified",
            "metadata_verification_status": "directory_metadata_unverified",
            "discovery_source": "live_directory", "relevance_score": 0.5,
            "relevance_confidence": category_confidence, "relevance_reason": f"Listed by APIs.guru and matched to the {category} category from its published API metadata.",
        })
        if len(output) >= min(limit * 4, 80):
            break
    _category_cache[category] = (now, output)
    filtered = _exclude_target(output, target_hostname)
    return {"alternatives": filtered[:limit], "is_cached": directory_cached, "retrieved_at": retrieved_at, "warning": None if filtered else "No live alternatives matched this category."}


def _exclude_target(entries: list[dict[str, Any]], target_hostname: str) -> list[dict[str, Any]]:
    target_host = _normalized_host(target_hostname)
    result = []
    for item in entries:
        raw_host = urlparse(str(item.get("website_url") or "https://" + str(item.get("provider_name", "")))).hostname or ""
        host = _normalized_host(raw_host)
        if host and (host == target_host or target_host.endswith("." + host) or host.endswith("." + target_host)):
            continue
        result.append(item)
    return result


def clear_caches() -> None:
    global _directory, _provider_domains
    _directory = None
    _provider_domains.clear()
    _category_cache.clear()
