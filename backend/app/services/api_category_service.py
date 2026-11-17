"""
app/services/api_category_service.py — Rule-based API category identification.

Design
------
Classification is intentionally done without any network requests or LLM calls.
It uses multiple evidence signals that are already available during a scan:

  1. Hostname tokens — subdomain + registrable domain
  2. URL path segments
  3. OpenAPI spec title / description / endpoint paths (if present)
  4. User-supplied notes

Signals are scored independently and aggregated per category.  A result is
returned only when at least one category's score exceeds the confidence
threshold; otherwise "Unknown / Unclassified" is returned.

Returned structure matches ApiCategoryResult schema (see app/schemas.py).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


# ── Category constants ──────────────────────────────────────────────────────────

class ApiCategory:
    AI_LLM            = "AI / LLM API"
    PAYMENT           = "Payment API"
    WEATHER           = "Weather API"
    MAPS_LOCATION     = "Maps / Location API"
    COMMUNICATION     = "Communication / Messaging API"
    AUTH_IDENTITY     = "Authentication / Identity API"
    CLOUD_STORAGE     = "Cloud Storage API"
    DATABASE          = "Database API"
    GENERAL_REST      = "General REST API"
    UNKNOWN           = "Unknown / Unclassified"


ALL_CATEGORIES: List[str] = [
    ApiCategory.AI_LLM,
    ApiCategory.PAYMENT,
    ApiCategory.WEATHER,
    ApiCategory.MAPS_LOCATION,
    ApiCategory.COMMUNICATION,
    ApiCategory.AUTH_IDENTITY,
    ApiCategory.CLOUD_STORAGE,
    ApiCategory.DATABASE,
    ApiCategory.GENERAL_REST,
    ApiCategory.UNKNOWN,
]

# Confidence threshold below which we return UNKNOWN
_CONFIDENT_THRESHOLD = 0.40     # score [0, 1] required to commit to a category
_USER_CONFIRM_THRESHOLD = 0.65  # below this, ask the user to confirm


# ── Rule tables ─────────────────────────────────────────────────────────────────
# Each rule is (pattern, weight).  Patterns are matched case-insensitively
# against a normalised signal string.  Weights should be positive and reflect
# how "specific" the signal is.

@dataclass
class _Rule:
    pattern: re.Pattern[str]
    weight: float
    signal_name: str = ""   # informational label used in the reason string


def _r(pattern: str, weight: float, signal_name: str = "") -> _Rule:
    return _Rule(re.compile(pattern, re.IGNORECASE), weight, signal_name)


# hostname / domain rules
_HOSTNAME_RULES: Dict[str, List[_Rule]] = {
    ApiCategory.AI_LLM: [
        _r(r"\bgemini\b",           0.90, "hostname:gemini"),
        _r(r"\bgemini-api\b",       0.95, "hostname:gemini-api"),
        _r(r"\bopenai\b",           0.90, "hostname:openai"),
        _r(r"\banthropicai\b",      0.90, "hostname:anthropic"),
        _r(r"\banthropic\b",        0.85, "hostname:anthropic"),
        _r(r"\bcohere\b",           0.85, "hostname:cohere"),
        _r(r"\bhf\.co\b",           0.75, "hostname:huggingface"),
        _r(r"\bhuggingface\b",      0.80, "hostname:huggingface"),
        _r(r"\bai\.google\b",       0.90, "hostname:ai.google"),
        _r(r"\bgenerativelanguage", 0.90, "hostname:generativelanguage"),
        _r(r"\bmistral\b",          0.80, "hostname:mistral"),
        _r(r"\btogether\.ai\b",     0.80, "hostname:together.ai"),
        _r(r"\bperplexity\b",       0.80, "hostname:perplexity"),
        _r(r"\breplicate\b",        0.75, "hostname:replicate"),
        _r(r"\bdeepseek\b",         0.80, "hostname:deepseek"),
        _r(r"\bgpt\b",              0.60, "hostname:gpt"),
        _r(r"\bllm\b",              0.55, "hostname:llm"),
    ],
    ApiCategory.PAYMENT: [
        _r(r"\bstripe\b",           0.95, "hostname:stripe"),
        _r(r"\bpaypal\b",           0.95, "hostname:paypal"),
        _r(r"\bbraintree\b",        0.90, "hostname:braintree"),
        _r(r"\bsquare\b",           0.80, "hostname:square"),
        _r(r"\badyen\b",            0.90, "hostname:adyen"),
        _r(r"\bcheckout\b",         0.70, "hostname:checkout"),
        _r(r"\bklarna\b",           0.90, "hostname:klarna"),
        _r(r"\bpayoneer\b",         0.85, "hostname:payoneer"),
        _r(r"\bworldpay\b",         0.90, "hostname:worldpay"),
        _r(r"\bplaid\b",            0.85, "hostname:plaid"),
        _r(r"\bpayu\b",             0.85, "hostname:payu"),
        _r(r"\brazorpay\b",         0.90, "hostname:razorpay"),
        _r(r"\btwilio\.pay\b",      0.80, "hostname:twilio-pay"),
    ],
    ApiCategory.WEATHER: [
        _r(r"\bopenweather",        0.90, "hostname:openweather"),
        _r(r"\bweatherapi\b",       0.90, "hostname:weatherapi"),
        _r(r"\bweatherbit\b",       0.90, "hostname:weatherbit"),
        _r(r"\baccuweather\b",      0.90, "hostname:accuweather"),
        _r(r"\bforecast\.io\b",     0.90, "hostname:forecast.io"),
        _r(r"\bapi\.weather\b",     0.85, "hostname:api.weather"),
        _r(r"\bweather\.gov\b",     0.90, "hostname:weather.gov"),
        _r(r"\bclimate\b",          0.40, "hostname:climate"),
        _r(r"\bweather\b",          0.60, "hostname:weather"),
        _r(r"\bmeteo\b",            0.65, "hostname:meteo"),
    ],
    ApiCategory.MAPS_LOCATION: [
        _r(r"\bmaps\.googleapis\b", 0.95, "hostname:maps.googleapis"),
        _r(r"\bmapbox\b",           0.90, "hostname:mapbox"),
        _r(r"\bhere\.com\b",        0.85, "hostname:here"),
        _r(r"\btomtom\b",           0.90, "hostname:tomtom"),
        _r(r"\bgeoapify\b",         0.85, "hostname:geoapify"),
        _r(r"\bosm\b",              0.70, "hostname:osm"),
        _r(r"\bopenmaptiles\b",     0.85, "hostname:openmaptiles"),
        _r(r"\bpositionstack\b",    0.85, "hostname:positionstack"),
        _r(r"\bgeocod",             0.70, "hostname:geocod*"),
        _r(r"\bgeonames\b",         0.85, "hostname:geonames"),
        _r(r"\bwaze\b",             0.80, "hostname:waze"),
    ],
    ApiCategory.COMMUNICATION: [
        _r(r"\btwilio\b",           0.90, "hostname:twilio"),
        _r(r"\bsendgrid\b",         0.90, "hostname:sendgrid"),
        _r(r"\bmailgun\b",          0.90, "hostname:mailgun"),
        _r(r"\bpostmark\b",         0.90, "hostname:postmark"),
        _r(r"\bnexmo\b",            0.85, "hostname:nexmo"),
        _r(r"\bvonage\b",           0.85, "hostname:vonage"),
        _r(r"\bmessagebird\b",      0.90, "hostname:messagebird"),
        _r(r"\bbird\b",             0.50, "hostname:bird"),
        _r(r"\bslack\b",            0.80, "hostname:slack"),
        _r(r"\bdiscord\b",          0.75, "hostname:discord"),
        _r(r"\bplivo\b",            0.85, "hostname:plivo"),
        _r(r"\binfobip\b",          0.90, "hostname:infobip"),
        _r(r"\baws\.ses\b",         0.80, "hostname:aws-ses"),
        _r(r"\bsms\b",              0.50, "hostname:sms"),
    ],
    ApiCategory.AUTH_IDENTITY: [
        _r(r"\bauth0\b",            0.95, "hostname:auth0"),
        _r(r"\bokta\b",             0.95, "hostname:okta"),
        _r(r"\bkeycloak\b",         0.90, "hostname:keycloak"),
        _r(r"\bcognito\b",          0.85, "hostname:cognito"),
        _r(r"\bsupabase\b",         0.70, "hostname:supabase"),
        _r(r"\bfirebase.*auth\b",   0.90, "hostname:firebase-auth"),
        _r(r"\bidentityplatform\b", 0.85, "hostname:identityplatform"),
        _r(r"\bonelogin\b",         0.90, "hostname:onelogin"),
        _r(r"\bping.*identity\b",   0.90, "hostname:ping-identity"),
        _r(r"\bidentity\b",         0.45, "hostname:identity"),
        _r(r"\bpassport\b",         0.40, "hostname:passport"),
        _r(r"\biam\b",              0.45, "hostname:iam"),
    ],
    ApiCategory.CLOUD_STORAGE: [
        _r(r"\bs3\.",               0.80, "hostname:s3"),
        _r(r"\bamazonaws\b",        0.70, "hostname:amazonaws"),
        _r(r"\bblobstorage\b",      0.90, "hostname:blobstorage"),
        _r(r"\bcloudflare.*r2\b",   0.90, "hostname:cloudflare-r2"),
        _r(r"\bgcs\b",              0.75, "hostname:gcs"),
        _r(r"\bstorage\.googleapis\b", 0.90, "hostname:storage.googleapis"),
        _r(r"\bbackblaze\b",        0.85, "hostname:backblaze"),
        _r(r"\bwasabi\b",           0.85, "hostname:wasabi"),
        _r(r"\bdropbox\b",          0.80, "hostname:dropbox"),
        _r(r"\bbox\.com\b",         0.80, "hostname:box"),
        _r(r"\bonedrive\b",         0.80, "hostname:onedrive"),
    ],
    ApiCategory.DATABASE: [
        _r(r"\bsupabase\b",         0.60, "hostname:supabase"),   # db + auth
        _r(r"\bplanetscale\b",      0.90, "hostname:planetscale"),
        _r(r"\bneon\b",             0.75, "hostname:neon"),
        _r(r"\bmongodb\b",          0.90, "hostname:mongodb"),
        _r(r"\batlasdata\b",        0.80, "hostname:atlasdata"),
        _r(r"\bfirestore\b",        0.85, "hostname:firestore"),
        _r(r"\bairtable\b",         0.80, "hostname:airtable"),
        _r(r"\bhasura\b",           0.85, "hostname:hasura"),
        _r(r"\bturso\b",            0.85, "hostname:turso"),
        _r(r"\bupstash\b",          0.80, "hostname:upstash"),
        _r(r"\bxata\b",             0.80, "hostname:xata"),
    ],
    # Known developer platforms expose general REST APIs without a narrower
    # product category in this model. This is an explicit provider signal,
    # not a generic match on arbitrary URLs containing "api" or "rest".
    ApiCategory.GENERAL_REST: [
        _r(r"\bapi\.github\.com\b|\bgithub\.com\b", 0.80, "hostname:github-developer-platform"),
        _r(r"\bapi\.gitlab\.com\b|\bgitlab\.com\b", 0.75, "hostname:gitlab-developer-platform"),
        _r(r"\bapi\.bitbucket\.org\b|\bbitbucket\.org\b", 0.75, "hostname:bitbucket-developer-platform"),
    ],
}

# URL path rules — lower weight because paths are less specific
_PATH_RULES: Dict[str, List[_Rule]] = {
    ApiCategory.AI_LLM: [
        _r(r"/chat/completions",    0.85, "path:/chat/completions"),
        _r(r"/completions\b",       0.75, "path:/completions"),
        _r(r"/embeddings\b",        0.60, "path:/embeddings"),
        _r(r"/generate\b",          0.35, "path:/generate"),
        _r(r"/v\d+/models\b",       0.35, "path:/v*/models"),
        _r(r"/v1beta/models",       0.80, "path:/v1beta/models"),   # Gemini
        _r(r"/generativelanguage",  0.90, "path:generativelanguage"),
        _r(r"/v1/messages\b",       0.70, "path:/v1/messages"),    # Anthropic
    ],
    ApiCategory.PAYMENT: [
        _r(r"/payment",             0.60, "path:/payment"),
        _r(r"/checkout",            0.55, "path:/checkout"),
        _r(r"/charges\b",           0.65, "path:/charges"),
        _r(r"/invoices\b",          0.55, "path:/invoices"),
        _r(r"/subscriptions\b",     0.50, "path:/subscriptions"),
        _r(r"/payouts\b",           0.65, "path:/payouts"),
        _r(r"/refund",              0.55, "path:/refund"),
        _r(r"/transaction",         0.50, "path:/transaction"),
        _r(r"/webhook.*stripe",     0.75, "path:/webhook-stripe"),
    ],
    ApiCategory.WEATHER: [
        _r(r"/weather\b",           0.70, "path:/weather"),
        _r(r"/forecast\b",          0.65, "path:/forecast"),
        _r(r"/current\b",           0.30, "path:/current"),
        _r(r"/climate\b",           0.50, "path:/climate"),
        _r(r"/temperature\b",       0.55, "path:/temperature"),
        _r(r"/precipitation\b",     0.65, "path:/precipitation"),
    ],
    ApiCategory.MAPS_LOCATION: [
        _r(r"/geocod",              0.70, "path:/geocod*"),
        _r(r"/directions\b",        0.70, "path:/directions"),
        _r(r"/maps\b",              0.60, "path:/maps"),
        _r(r"/places\b",            0.55, "path:/places"),
        _r(r"/coordinates\b",       0.60, "path:/coordinates"),
        _r(r"/reverse",             0.40, "path:/reverse"),
        _r(r"/routing\b",           0.60, "path:/routing"),
        _r(r"/tile\b",              0.45, "path:/tile"),
    ],
    ApiCategory.COMMUNICATION: [
        _r(r"/messages\b",          0.45, "path:/messages"),
        _r(r"/sms\b",               0.70, "path:/sms"),
        _r(r"/email\b",             0.55, "path:/email"),
        _r(r"/send\b",              0.35, "path:/send"),
        _r(r"/notifications?\b",    0.45, "path:/notifications"),
        _r(r"/channels\b",          0.40, "path:/channels"),
    ],
    ApiCategory.AUTH_IDENTITY: [
        _r(r"/oauth\b",             0.75, "path:/oauth"),
        _r(r"/token\b",             0.55, "path:/token"),
        _r(r"/login\b",             0.50, "path:/login"),
        _r(r"/auth\b",              0.60, "path:/auth"),
        _r(r"/users\b",             0.35, "path:/users"),
        _r(r"/session\b",           0.45, "path:/session"),
        _r(r"/jwks\b",              0.70, "path:/jwks"),
        _r(r"/userinfo\b",          0.70, "path:/userinfo"),
    ],
    ApiCategory.CLOUD_STORAGE: [
        _r(r"/upload\b",            0.40, "path:/upload"),
        _r(r"/download\b",          0.35, "path:/download"),
        _r(r"/blob\b",              0.55, "path:/blob"),
        _r(r"/object\b",            0.40, "path:/object"),
        _r(r"/bucket\b",            0.60, "path:/bucket"),
        _r(r"/files\b",             0.35, "path:/files"),
    ],
    ApiCategory.DATABASE: [
        _r(r"/query\b",             0.50, "path:/query"),
        _r(r"/graphql\b",           0.55, "path:/graphql"),
        _r(r"/sql\b",               0.65, "path:/sql"),
        _r(r"/rows\b",              0.55, "path:/rows"),
        _r(r"/tables\b",            0.55, "path:/tables"),
        _r(r"/collections\b",       0.50, "path:/collections"),
    ],
}

# Title / description text rules (from OpenAPI spec or notes)
_TEXT_RULES: Dict[str, List[_Rule]] = {
    ApiCategory.AI_LLM: [
        _r(r"\b(llm|large.language.model)\b",   0.80, "text:llm"),
        _r(r"\b(ai|artificial.intelligence)\b",  0.40, "text:ai"),
        _r(r"\b(chatgpt|gpt-4|gpt-3)\b",        0.85, "text:gpt"),
        _r(r"\b(text.generation|completion)\b",  0.60, "text:completion"),
        _r(r"\b(embedding|vector)\b",            0.45, "text:embedding"),
        _r(r"\b(gemini|palm|bard)\b",            0.85, "text:gemini"),
        _r(r"\b(claude|anthropic)\b",            0.85, "text:claude"),
        _r(r"\b(language.model|foundation.model)\b", 0.75, "text:language-model"),
    ],
    ApiCategory.PAYMENT: [
        _r(r"\b(payment|billing|invoice)\b",     0.65, "text:payment"),
        _r(r"\b(stripe|paypal|braintree)\b",     0.90, "text:payment-brand"),
        _r(r"\b(charge|refund|payout)\b",        0.55, "text:charge"),
        _r(r"\b(checkout|cart|order)\b",         0.45, "text:checkout"),
        _r(r"\b(subscription|recurring)\b",      0.50, "text:subscription"),
        _r(r"\b(wallet|fintech|banking)\b",       0.50, "text:fintech"),
    ],
    ApiCategory.WEATHER: [
        _r(r"\b(weather|forecast|meteorolog)\b", 0.80, "text:weather"),
        _r(r"\b(temperature|humidity|wind)\b",   0.65, "text:climate-data"),
        _r(r"\b(precipitation|rainfall|snow)\b", 0.70, "text:precipitation"),
        _r(r"\b(climate|atmospheric)\b",         0.55, "text:climate"),
    ],
    ApiCategory.MAPS_LOCATION: [
        _r(r"\b(geocod|reverse.geocod)\b",       0.80, "text:geocoding"),
        _r(r"\b(map|navigation|routing)\b",      0.65, "text:maps"),
        _r(r"\b(latitude|longitude|coord)\b",    0.70, "text:coordinates"),
        _r(r"\b(place|poi|location.service)\b",  0.55, "text:places"),
        _r(r"\b(direction|distance.matrix)\b",   0.65, "text:directions"),
    ],
    ApiCategory.COMMUNICATION: [
        _r(r"\b(sms|short.message)\b",           0.75, "text:sms"),
        _r(r"\b(email|smtp|mailing)\b",          0.65, "text:email"),
        _r(r"\b(messaging|chat|push.notif)\b",   0.60, "text:messaging"),
        _r(r"\b(twilio|sendgrid|mailgun)\b",     0.90, "text:comms-brand"),
        _r(r"\b(whatsapp|telegram|signal)\b",    0.70, "text:messenger"),
    ],
    ApiCategory.AUTH_IDENTITY: [
        _r(r"\b(oauth|openid|oidc|saml)\b",      0.80, "text:oauth"),
        _r(r"\b(authentication|authorization)\b", 0.65, "text:auth"),
        _r(r"\b(identity|sso|single.sign)\b",    0.65, "text:identity"),
        _r(r"\b(jwt|token.issu)\b",              0.60, "text:jwt"),
        _r(r"\b(auth0|okta|keycloak)\b",         0.90, "text:auth-brand"),
    ],
    ApiCategory.CLOUD_STORAGE: [
        _r(r"\b(object.storage|blob.storage)\b", 0.80, "text:object-storage"),
        _r(r"\b(s3.compatible|s3.bucket)\b",     0.80, "text:s3"),
        _r(r"\b(file.upload|file.download)\b",   0.55, "text:file"),
        _r(r"\b(cdn|content.delivery)\b",        0.45, "text:cdn"),
        _r(r"\b(dropbox|backblaze|wasabi)\b",    0.85, "text:storage-brand"),
    ],
    ApiCategory.DATABASE: [
        _r(r"\b(database|db|sql|nosql)\b",       0.70, "text:database"),
        _r(r"\b(query|schema|table|row)\b",      0.55, "text:db-ops"),
        _r(r"\b(graphql|rest.db)\b",             0.60, "text:graphql"),
        _r(r"\b(mongodb|postgres|mysql)\b",      0.80, "text:db-brand"),
        _r(r"\b(airtable|supabase.db|hasura)\b", 0.75, "text:db-platform"),
        _r(r"\b(realtime.*database)\b",          0.65, "text:realtime-db"),
    ],
}


# ── Core classifier ─────────────────────────────────────────────────────────────

@dataclass
class ClassificationResult:
    category: str
    confidence: float          # 0.0 – 1.0
    reason: str
    detection_method: str
    requires_user_confirmation: bool
    # signals that contributed to the decision (for debugging / transparency)
    matched_signals: List[str] = field(default_factory=list)


def _score_text(text: str, rules: Dict[str, List[_Rule]]) -> Dict[str, float]:
    """Return per-category scores by matching rules against `text`."""
    scores: Dict[str, float] = {}
    for category, rule_list in rules.items():
        for rule in rule_list:
            if rule.pattern.search(text):
                scores[category] = max(scores.get(category, 0.0), rule.weight)
    return scores


def _merge_scores(
    *score_maps: Dict[str, float],
    weights: Optional[List[float]] = None,
) -> Dict[str, float]:
    """
    Combine multiple signal-score dicts using max pooling per category,
    then cap at 1.0.
    """
    if weights is None:
        weights = [1.0] * len(score_maps)

    merged: Dict[str, float] = {}
    for w, sm in zip(weights, score_maps):
        for cat, score in sm.items():
            merged[cat] = max(merged.get(cat, 0.0), score * w)
    return merged


def classify_api(
    url: str,
    *,
    spec_title: Optional[str] = None,
    spec_description: Optional[str] = None,
    spec_endpoints: Optional[List[str]] = None,  # list of path strings
    user_notes: Optional[str] = None,
) -> ClassificationResult:
    """
    Classify an API URL into one of the predefined categories.

    Parameters
    ----------
    url              : The scanned API URL.
    spec_title       : Title from an OpenAPI spec (if available).
    spec_description : Description from the spec info block (if available).
    spec_endpoints   : List of endpoint paths extracted from the spec.
    user_notes       : Free-text notes the user entered at scan time.

    Returns
    -------
    ClassificationResult with category, confidence, reason, and metadata.
    """
    parsed = urlparse(url)
    hostname: str = (parsed.hostname or "").lower()
    path: str = parsed.path.lower()

    # Build composite text signal from every available text source
    extra_text_parts: List[str] = []
    if spec_title:
        extra_text_parts.append(spec_title)
    if spec_description:
        extra_text_parts.append(spec_description)
    if spec_endpoints:
        extra_text_parts.extend(spec_endpoints)
    if user_notes:
        extra_text_parts.append(user_notes)
    extra_text = " ".join(extra_text_parts)

    # --- Score each signal independently ---
    hostname_scores = _score_text(hostname, _HOSTNAME_RULES)
    path_scores     = _score_text(path,     _PATH_RULES)
    text_scores     = _score_text(extra_text, _TEXT_RULES) if extra_text else {}

    # Weight hostname highest (most specific), path medium, text lowest
    merged = _merge_scores(
        hostname_scores,
        path_scores,
        text_scores,
        weights=[1.0, 0.70, 0.55],
    )

    if not merged:
        return _unknown_result("No matching signals found in URL, path, or spec metadata.")

    # Pick the highest-scoring category
    best_category = max(merged, key=lambda c: merged[c])
    best_score    = merged[best_category]

    if best_score < _CONFIDENT_THRESHOLD:
        return _unknown_result(
            f"Highest signal score {best_score:.2f} for «{best_category}» is below "
            f"the confidence threshold ({_CONFIDENT_THRESHOLD:.2f})."
        )

    # Collect matched signal names for the reason string
    matched: List[str] = []
    for smap, rules_dict in [
        (hostname_scores, _HOSTNAME_RULES),
        (path_scores, _PATH_RULES),
        (text_scores, _TEXT_RULES),
    ]:
        if best_category in smap:
            # Find which rules fired
            source_text = {
                id(hostname_scores): hostname,
                id(path_scores): path,
                id(text_scores): extra_text,
            }[id(smap)]
            for rule in rules_dict[best_category]:
                if rule.pattern.search(source_text):
                    matched.append(rule.signal_name)

    # Determine detection method label
    methods_used: List[str] = []
    if hostname_scores.get(best_category, 0) > 0:
        methods_used.append("hostname")
    if path_scores.get(best_category, 0) > 0:
        methods_used.append("url_path")
    if text_scores.get(best_category, 0) > 0:
        if spec_title or spec_description or spec_endpoints:
            methods_used.append("spec_metadata")
        if user_notes:
            methods_used.append("user_notes")
    detection_method = "+".join(methods_used) if methods_used else "url_analysis"

    # Build human-readable reason
    reason = _build_reason(best_category, matched[:3], best_score, url)

    requires_confirmation = best_score < _USER_CONFIRM_THRESHOLD

    return ClassificationResult(
        category=best_category,
        confidence=round(min(best_score, 1.0), 2),
        reason=reason,
        detection_method=detection_method,
        requires_user_confirmation=requires_confirmation,
        matched_signals=matched,
    )


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _unknown_result(reason: str) -> ClassificationResult:
    return ClassificationResult(
        category=ApiCategory.UNKNOWN,
        confidence=0.0,
        reason=reason,
        detection_method="none",
        requires_user_confirmation=True,
        matched_signals=[],
    )


def _build_reason(
    category: str,
    signals: List[str],
    score: float,
    url: str,
) -> str:
    parsed = urlparse(url)
    hostname = parsed.hostname or url
    signal_summary = ", ".join(s.split(":", 1)[-1] for s in signals) if signals else "pattern match"
    pct = int(score * 100)
    return (
        f"Classified as «{category}» with {pct}% confidence. "
        f"Key signals: {signal_summary} (from {hostname})."
    )


def classify_api_from_result_json(
    url: str,
    result_json_dict: Optional[Dict[str, Any]] = None,
    user_notes: Optional[str] = None,
) -> ClassificationResult:
    """
    Convenience wrapper that extracts available OpenAPI metadata from an
    already-parsed result_json dict before calling classify_api().

    If no operation_context is present in result_json, classification falls
    back to URL-only analysis.
    """
    spec_title: Optional[str] = None
    spec_description: Optional[str] = None
    spec_endpoints: Optional[List[str]] = None

    if result_json_dict:
        op_ctx = result_json_dict.get("operation_context") or {}
        spec_title = op_ctx.get("spec_title")
        spec_description = op_ctx.get("description")
        # Collect endpoint paths that were part of the scan context
        raw_path = op_ctx.get("path")
        if raw_path:
            spec_endpoints = [raw_path]

    return classify_api(
        url,
        spec_title=spec_title,
        spec_description=spec_description,
        spec_endpoints=spec_endpoints,
        user_notes=user_notes,
    )


def validate_manual_category(category: str) -> str:
    """
    Validate a user-submitted category string.
    Returns the category if valid, raises ValueError otherwise.
    """
    if category in ALL_CATEGORIES:
        return category
    raise ValueError(
        f"Invalid category '{category}'. Must be one of: {', '.join(ALL_CATEGORIES)}"
    )
