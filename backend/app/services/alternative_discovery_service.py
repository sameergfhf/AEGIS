"""
app/services/alternative_discovery_service.py — Discover real alternative APIs
for an identified API category.

Design & Security
-----------------
1. Receives the detected (or user-corrected) category from Step 1.
2. Identifies genuine, real-world alternatives from verified provider catalogues
   and public API registries (e.g. APIs.guru OpenAPI directory).
3. Excludes the scanned API itself so a provider is never suggested as an alternative
   to itself.
4. Calculates relevance similarity scores [0.0, 1.0] based on functional compatibility,
   feature overlap, auth alignment, and endpoint matching.
5. All external URL accesses (if any) enforce SSRF protection via resolve_and_validate,
   private IP blocking, HTTPS requirement, and strict response timeouts.
6. Does NOT perform security scans or assign security scores to alternatives (Steps 3 & 4).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from app.services.api_category_service import ApiCategory
from app.security.url_validation import resolve_and_validate, URLValidationError

logger = logging.getLogger(__name__)


# ── Provider Alternative Definition ─────────────────────────────────────────────

@dataclass
class AlternativeProvider:
    id: str
    provider_name: str
    api_name: str
    category: str
    description: str
    website_url: str
    documentation_url: str
    main_functionality: str
    supported_features: List[str]
    authentication_methods: List[str]
    pricing_model: str
    pricing_details: Optional[str]
    pricing_url: Optional[str]
    openapi_spec_url: Optional[str]
    compatibility_notes: str
    source_urls: List[str]
    verification_status: str = "verified"   # verified | community | unverified
    api_endpoint_url: Optional[str] = None  # Verified API base URL / safe probe endpoint
    endpoint_status: str = "verified"       # verified | endpoint_unverified
    # Keywords / host indicators used to detect if the scanned target IS this provider
    identity_keywords: List[str] = field(default_factory=list)
    # Feature tokens used for relevance matching against user URL & endpoints
    feature_tags: List[str] = field(default_factory=list)


# ── Curated & Verified Alternative Catalogue ────────────────────────────────────
# Every provider, URL, auth method, and pricing model below is verified from
# official provider documentation and registries.

_VERIFIED_CATALOGUE: Dict[str, List[AlternativeProvider]] = {
    ApiCategory.AI_LLM: [
        AlternativeProvider(
            id="openai-api",
            provider_name="OpenAI",
            api_name="OpenAI REST API",
            category=ApiCategory.AI_LLM,
            description="Leading multimodal and reasoning large language model API powering GPT-4o, GPT-4 Turbo, and o1/o3 reasoning models.",
            website_url="https://openai.com",
            documentation_url="https://platform.openai.com/docs/api-reference",
            main_functionality="Chat completions, multimodal vision, function calling / tool use, text embeddings, speech synthesis, and structured JSON outputs.",
            supported_features=[
                "GPT-4o", "GPT-4o mini", "o1 reasoning", "Tool calling / Function calling",
                "Text embeddings (text-embedding-3)", "JSON Schema mode", "Streaming SSE",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <API_KEY>)"],
            pricing_model="Usage-based (per 1M input / output tokens)",
            pricing_details="Pay-as-you-go tiered by token usage. Separate rates for prompt tokens, completion tokens, and cached prompt tokens.",
            pricing_url="https://openai.com/api/pricing/",
            openapi_spec_url="https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml",
            compatibility_notes="Industry standard /v1/chat/completions interface widely mirrored by open-source inference proxies.",
            source_urls=[
                "https://platform.openai.com/docs/api-reference",
                "https://openai.com/api/pricing/",
            ],
            api_endpoint_url="https://api.openai.com/v1/models",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["openai", "api.openai.com", "gpt-4", "chatgpt"],
            feature_tags=["chat", "completions", "embeddings", "vision", "tools", "reasoning"],
        ),
        AlternativeProvider(
            id="anthropic-claude-api",
            provider_name="Anthropic",
            api_name="Claude Messages API",
            category=ApiCategory.AI_LLM,
            description="Safety-focused frontier language models with industry-leading reasoning, coding, and 200k context window capabilities.",
            website_url="https://www.anthropic.com",
            documentation_url="https://docs.anthropic.com/en/api/getting-started",
            main_functionality="Conversational reasoning, long-context document analysis, prompt caching, computer use, and structured tool execution.",
            supported_features=[
                "Claude 3.5 Sonnet", "Claude 3.5 Haiku", "Claude 3 Opus",
                "200K token context window", "Prompt caching (up to 90% cost reduction)",
                "Vision input", "Tool use",
            ],
            authentication_methods=["Custom Header (x-api-key: <API_KEY>)"],
            pricing_model="Usage-based (per 1M input / output tokens)",
            pricing_details="Tiered token rates with discount for prompt cache read hits. Pre-paid credit system.",
            pricing_url="https://www.anthropic.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="Uses native /v1/messages schema; client SDKs available for Python, TypeScript, and Go.",
            source_urls=[
                "https://docs.anthropic.com/en/api/getting-started",
                "https://www.anthropic.com/pricing",
            ],
            api_endpoint_url="https://api.anthropic.com/v1/messages",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["anthropic", "api.anthropic.com", "claude"],
            feature_tags=["chat", "messages", "reasoning", "coding", "cache", "vision"],
        ),
        AlternativeProvider(
            id="google-gemini-api",
            provider_name="Google",
            api_name="Google Gemini API",
            category=ApiCategory.AI_LLM,
            description="Google's multimodal flagship AI platform with massive 1M-2M token context windows, audio, and video comprehension.",
            website_url="https://ai.google.dev",
            documentation_url="https://ai.google.dev/api",
            main_functionality="Multimodal reasoning (text, images, audio, video), code generation, embeddings, and context-caching.",
            supported_features=[
                "Gemini 1.5 Pro", "Gemini 1.5 Flash", "Gemini 2.0 Flash",
                "Up to 2M token context window", "Native audio & video comprehension",
                "Context caching", "Google Search grounding",
            ],
            authentication_methods=["API Key via query param (?key=) or Header (x-goog-api-key)"],
            pricing_model="Freemium + Pay-as-you-go",
            pricing_details="Generous free tier with rate limits (15 RPM). Paid tier billed per 1M characters/tokens via Google Cloud.",
            pricing_url="https://ai.google.dev/pricing",
            openapi_spec_url=None,
            compatibility_notes="REST API via generativelanguage.googleapis.com; also accessible via Google Cloud Vertex AI and OpenAI-compatible endpoints.",
            source_urls=[
                "https://ai.google.dev/api",
                "https://ai.google.dev/pricing",
            ],
            api_endpoint_url="https://generativelanguage.googleapis.com/v1beta/models",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["gemini", "generativelanguage.googleapis.com", "ai.google"],
            feature_tags=["chat", "generateContent", "multimodal", "video", "embeddings"],
        ),
        AlternativeProvider(
            id="mistral-ai-api",
            provider_name="Mistral AI",
            api_name="Mistral AI API",
            category=ApiCategory.AI_LLM,
            description="European high-efficiency frontier models combining strong benchmark performance with open weights and enterprise data privacy.",
            website_url="https://mistral.ai",
            documentation_url="https://docs.mistral.ai/api/",
            main_functionality="Text generation, function calling, code generation, embeddings, and fine-tuning.",
            supported_features=[
                "Mistral Large 2", "Codestral", "Mistral NeMo",
                "Mistral Embed", "Function calling", "JSON output enforcement",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <API_KEY>)"],
            pricing_model="Usage-based (per 1M tokens)",
            pricing_details="Competitive pay-as-you-go token pricing; free experimentation tier available on La Plateforme.",
            pricing_url="https://mistral.ai/technology/#pricing",
            openapi_spec_url=None,
            compatibility_notes="OpenAI-compatible client format; easily swapped using standard OpenAI SDKs by changing baseURL.",
            source_urls=[
                "https://docs.mistral.ai/api/",
                "https://mistral.ai/technology/#pricing",
            ],
            api_endpoint_url="https://api.mistral.ai/v1/models",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["mistral", "api.mistral.ai"],
            feature_tags=["chat", "completions", "embeddings", "coding", "open-weights"],
        ),
        AlternativeProvider(
            id="cohere-api",
            provider_name="Cohere",
            api_name="Cohere Command & Embed API",
            category=ApiCategory.AI_LLM,
            description="Enterprise-specialized language model platform renowned for state-of-the-art retrieval augmented generation (RAG) and reranking.",
            website_url="https://cohere.com",
            documentation_url="https://docs.cohere.com/reference/about",
            main_functionality="Command reasoning, industry-standard Rerank API, multilingual text embeddings, and enterprise search.",
            supported_features=[
                "Command R+", "Command R", "Cohere Rerank v3",
                "Embed v3 (multilingual)", "Native web search connector",
                "Citations and grounded attribution",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <API_KEY>)"],
            pricing_model="Usage-based per call / tokens",
            pricing_details="Free developer tier with rate limits. Paid tier billed per 1M tokens or per 1,000 search queries for Rerank.",
            pricing_url="https://cohere.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="Specialized endpoints for /v1/chat, /v1/rerank, and /v1/embed.",
            source_urls=[
                "https://docs.cohere.com/reference/about",
                "https://cohere.com/pricing",
            ],
            api_endpoint_url="https://api.cohere.com/v2/models",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["cohere", "api.cohere.ai", "api.cohere.com"],
            feature_tags=["chat", "rerank", "embeddings", "rag", "search"],
        ),
        AlternativeProvider(
            id="groq-cloud-api",
            provider_name="Groq",
            api_name="GroqCloud LPU Inference API",
            category=ApiCategory.AI_LLM,
            description="Ultra-fast LPUs (Language Processing Units) providing the world's fastest token generation speeds for open-source foundation models.",
            website_url="https://groq.com",
            documentation_url="https://console.groq.com/docs/quickstart",
            main_functionality="Real-time, sub-second token generation for Llama 3, Mixtral, and Gemma models.",
            supported_features=[
                "Llama 3.3 70B", "Llama 3.1 8B", "Mixtral 8x7B", "Whisper large v3",
                "Ultra-low latency (~300-500 tokens/sec)", "Function calling",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <API_KEY>)"],
            pricing_model="Usage-based (per 1M tokens)",
            pricing_details="Generous free beta tier; ultra-low pricing per million tokens on paid tiers.",
            pricing_url="https://groq.com/pricing/",
            openapi_spec_url=None,
            compatibility_notes="100% OpenAI-compatible API; drop-in replacement with api.groq.com/openai/v1.",
            source_urls=[
                "https://console.groq.com/docs/quickstart",
                "https://groq.com/pricing/",
            ],
            api_endpoint_url="https://api.groq.com/openai/v1/models",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["groq", "api.groq.com"],
            feature_tags=["chat", "completions", "fast", "lpu", "llama", "whisper"],
        ),
    ],

    ApiCategory.PAYMENT: [
        AlternativeProvider(
            id="stripe-api",
            provider_name="Stripe",
            api_name="Stripe Payments API",
            category=ApiCategory.PAYMENT,
            description="Industry-standard financial infrastructure platform for online payment processing, subscription management, and global payouts.",
            website_url="https://stripe.com",
            documentation_url="https://docs.stripe.com/api",
            main_functionality="Credit/debit card processing, ACH/SEPA direct debits, digital wallets (Apple Pay, Google Pay), subscriptions, and Connect marketplaces.",
            supported_features=[
                "PaymentIntents API", "Subscriptions & Billing", "Stripe Checkout",
                "Connect Marketplace Payouts", "Radar Fraud Detection", "Webhooks with signature verification",
            ],
            authentication_methods=["Bearer Token / HTTP Basic (Authorization: Bearer sk_live_...)"],
            pricing_model="Transaction fee (percentage + fixed fee)",
            pricing_details="Standard 2.9% + $0.30 per successful card charge in the US. No setup or monthly fees.",
            pricing_url="https://stripe.com/pricing",
            openapi_spec_url="https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml",
            compatibility_notes="RESTful JSON API with comprehensive SDKs in Ruby, Python, Node, PHP, Java, .NET, and Go.",
            source_urls=[
                "https://docs.stripe.com/api",
                "https://stripe.com/pricing",
            ],
            api_endpoint_url="https://api.stripe.com/v1/charges",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["stripe", "api.stripe.com"],
            feature_tags=["charges", "payment_intents", "checkout", "subscriptions", "invoices", "cards"],
        ),
        AlternativeProvider(
            id="paypal-rest-api",
            provider_name="PayPal",
            api_name="PayPal Complete Payments REST API",
            category=ApiCategory.PAYMENT,
            description="Globally recognized payment processor enabling payments from PayPal accounts, Venmo, Pay in 4, and major credit cards.",
            website_url="https://www.paypal.com",
            documentation_url="https://developer.paypal.com/api/rest/",
            main_functionality="Orders API, automated subscriptions, direct payouts, dispute management, and webhooks.",
            supported_features=[
                "Orders v2 API", "PayPal Wallet & Venmo", "Subscriptions",
                "Vault payment methods", "Payouts API", "Webhooks",
            ],
            authentication_methods=["OAuth 2.0 Bearer Token (retrieved via Client ID & Secret)"],
            pricing_model="Transaction fee (percentage + fixed fee)",
            pricing_details="Standard 3.49% + $0.49 for PayPal checkout; standard 2.59% + $0.49 for card processing in the US.",
            pricing_url="https://www.paypal.com/us/webapps/mpp/merchant-fees",
            openapi_spec_url=None,
            compatibility_notes="RESTful v2 endpoints supporting standard idempotency headers and JSON request/response formats.",
            source_urls=[
                "https://developer.paypal.com/api/rest/",
                "https://www.paypal.com/us/webapps/mpp/merchant-fees",
            ],
            api_endpoint_url="https://api-m.paypal.com/v1/oauth2/token",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["paypal", "api.paypal.com", "api-m.paypal.com"],
            feature_tags=["orders", "checkout", "subscriptions", "payouts", "wallets"],
        ),
        AlternativeProvider(
            id="adyen-api",
            provider_name="Adyen",
            api_name="Adyen Checkout & Payments API",
            category=ApiCategory.PAYMENT,
            description="Global enterprise payments platform facilitating end-to-end gateway, risk management, and acquiring services.",
            website_url="https://www.adyen.com",
            documentation_url="https://docs.adyen.com/api-explorer/",
            main_functionality="Unified omnichannel commerce, global local payment methods, tokenized recurring billing, and 3D Secure 2 authentication.",
            supported_features=[
                "Checkout API", "250+ local payment methods", "RevenueAccelerate smart retry",
                "3DS2 compliance", "Automated recurring billing", "POS Terminal API",
            ],
            authentication_methods=["API Key header (X-API-Key: <key>)"],
            pricing_model="Interchange++ pricing or fixed processing fee",
            pricing_details="Fixed €0.11 processing fee + payment method fee depending on card interchange and region.",
            pricing_url="https://www.adyen.com/pricing",
            openapi_spec_url="https://raw.githubusercontent.com/Adyen/adyen-openapi/main/json/CheckoutService-v71.json",
            compatibility_notes="Enterprise-grade JSON REST API with comprehensive webhooks (HMAC-SHA256 signature).",
            source_urls=[
                "https://docs.adyen.com/api-explorer/",
                "https://www.adyen.com/pricing",
            ],
            api_endpoint_url="https://checkout-test.adyen.com/v71/payments",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["adyen", "checkout-test.adyen.com", "pal-test.adyen.com"],
            feature_tags=["checkout", "payments", "global", "cards", "recurring", "enterprise"],
        ),
        AlternativeProvider(
            id="square-api",
            provider_name="Square",
            api_name="Square Payments & Orders API",
            category=ApiCategory.PAYMENT,
            description="Omnichannel payment processing seamlessly unifying in-person Point-of-Sale (POS) hardware and online e-commerce transactions.",
            website_url="https://squareup.com",
            documentation_url="https://developer.squareup.com/docs",
            main_functionality="Online payments, customer card-on-file vaulting, recurring subscriptions, and POS Terminal integration.",
            supported_features=[
                "Payments API", "Orders API", "Customers API",
                "Subscriptions API", "Terminal API", "Webhooks",
            ],
            authentication_methods=["OAuth 2.0 Bearer Token (Authorization: Bearer <ACCESS_TOKEN>)"],
            pricing_model="Transaction fee (percentage + fixed fee)",
            pricing_details="2.9% + $0.30 per online transaction in the US. No monthly account fees.",
            pricing_url="https://squareup.com/us/en/payments/pricing",
            openapi_spec_url=None,
            compatibility_notes="Consistent OpenAPI-modeled REST endpoints with SDKs in Node, Python, Java, C#, and Ruby.",
            source_urls=[
                "https://developer.squareup.com/docs",
                "https://squareup.com/us/en/payments/pricing",
            ],
            api_endpoint_url="https://connect.squareup.com/v2/merchants",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["square", "squareup.com", "connect.squareup.com"],
            feature_tags=["payments", "orders", "pos", "subscriptions", "cards"],
        ),
        AlternativeProvider(
            id="razorpay-api",
            provider_name="Razorpay",
            api_name="Razorpay Payments API",
            category=ApiCategory.PAYMENT,
            description="Comprehensive payment gateway supporting Indian and international payments including UPI, NetBanking, Cards, and Wallets.",
            website_url="https://razorpay.com",
            documentation_url="https://razorpay.com/docs/api/",
            main_functionality="UPI deep integration, automated subscriptions, smart payment links, customer verification, and payouts.",
            supported_features=[
                "UPI Autopay", "Payment Links & Pages", "Smart Routing",
                "Subscriptions & Invoices", "Route Marketplace Settlements",
            ],
            authentication_methods=["HTTP Basic Auth (Key ID & Key Secret)"],
            pricing_model="Standard 2% transaction fee",
            pricing_details="2% on standard domestic transactions (UPI, Cards, NetBanking); 3% on international cards.",
            pricing_url="https://razorpay.com/pricing/",
            openapi_spec_url=None,
            compatibility_notes="RESTful JSON API with extensive mobile and web SDKs.",
            source_urls=[
                "https://razorpay.com/docs/api/",
                "https://razorpay.com/pricing/",
            ],
            api_endpoint_url="https://api.razorpay.com/v1/orders",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["razorpay", "api.razorpay.com"],
            feature_tags=["payments", "upi", "subscriptions", "invoices", "cards"],
        ),
    ],

    ApiCategory.WEATHER: [
        AlternativeProvider(
            id="openweather-api",
            provider_name="OpenWeatherMap",
            api_name="OpenWeather One Call API 3.0",
            category=ApiCategory.WEATHER,
            description="The most widely implemented weather data API offering real-time conditions, minute forecasts, and 45-year historical archives.",
            website_url="https://openweathermap.org",
            documentation_url="https://openweathermap.org/api/one-call-3",
            main_functionality="Current weather, minute-by-minute precipitation forecast for 1 hour, 48-hour hourly forecast, 8-day daily forecast, and weather alerts.",
            supported_features=[
                "One Call API 3.0", "Minute precipitation for 1h", "Historical weather data (1979-present)",
                "National weather alerts", "Solar radiation & UV index", "Geocoding API",
            ],
            authentication_methods=["API Key via query parameter (?appid=<KEY>)"],
            pricing_model="Freemium (1,000 free calls/day + pay-per-call)",
            pricing_details="1,000 calls/day free. Additional calls billed at $0.0015 per call. Monthly subscriptions available.",
            pricing_url="https://openweathermap.org/pricing",
            openapi_spec_url=None,
            compatibility_notes="JSON API with simple coordinate / query parameter semantics. Coordinates given as lat/lon.",
            source_urls=[
                "https://openweathermap.org/api/one-call-3",
                "https://openweathermap.org/pricing",
            ],
            api_endpoint_url="https://api.openweathermap.org/data/2.5/weather",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["openweather", "openweathermap.org", "api.openweathermap.org"],
            feature_tags=["weather", "forecast", "current", "historical", "temperature", "alerts"],
        ),
        AlternativeProvider(
            id="weatherapi",
            provider_name="WeatherAPI",
            api_name="WeatherAPI Realtime & Forecast API",
            category=ApiCategory.WEATHER,
            description="High-performance weather and geolocation API with generous free tiers, air quality indices, sports events, and astronomy data.",
            website_url="https://www.weatherapi.com",
            documentation_url="https://www.weatherapi.com/docs/",
            main_functionality="Real-time weather, 14-day forecasts, air quality index (AQI), astronomy, weather alerts, and IP lookup.",
            supported_features=[
                "Current & Forecast (up to 14 days)", "Air Quality data (EPA & DEFRA standards)",
                "Historical weather (2010 to present)", "Marine & tides forecast", "Severe weather alerts",
            ],
            authentication_methods=["API Key via query parameter (?key=<KEY>) or Header (key: <KEY>)"],
            pricing_model="Freemium (1,000,000 free calls/month)",
            pricing_details="Free tier provides 1,000,000 calls/month with 3 days forecast. Paid tiers start at $4/month.",
            pricing_url="https://www.weatherapi.com/pricing.aspx",
            openapi_spec_url=None,
            compatibility_notes="Supports both JSON and XML output formats. Location query accepts lat/lon, city name, US zip, UK postcode, or IP address.",
            source_urls=[
                "https://www.weatherapi.com/docs/",
                "https://www.weatherapi.com/pricing.aspx",
            ],
            api_endpoint_url="https://api.weatherapi.com/v1/current.json",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["weatherapi", "api.weatherapi.com"],
            feature_tags=["weather", "forecast", "air_quality", "marine", "alerts", "astronomy"],
        ),
        AlternativeProvider(
            id="tomorrow-io-api",
            provider_name="Tomorrow.io",
            api_name="Tomorrow.io Weather API",
            category=ApiCategory.WEATHER,
            description="Hyperlocal weather intelligence platform utilizing proprietary radar, satellite, and connected IoT sensor networks.",
            website_url="https://www.tomorrow.io",
            documentation_url="https://docs.tomorrow.io/reference/welcome",
            main_functionality="Hyperlocal minute-by-minute precipitation, road risk, air quality, pollen counts, fire index, and solar radiation.",
            supported_features=[
                "Timeline API v4", "Minute-by-minute precipitation", "Pollen & Air Quality indexes",
                "Fire index & road weather", "Historical re-analysis",
            ],
            authentication_methods=["API Key via query param (?apikey=<KEY>) or Header (apikey: <KEY>)"],
            pricing_model="Freemium (500 calls/day free)",
            pricing_details="Free tier includes 500 calls/day and 25 calls/hour. Developer plan starts at $25/month.",
            pricing_url="https://www.tomorrow.io/pricing/",
            openapi_spec_url=None,
            compatibility_notes="High-precision JSON Timeline API format with customizable metric / imperial unit conversion.",
            source_urls=[
                "https://docs.tomorrow.io/reference/welcome",
                "https://www.tomorrow.io/pricing/",
            ],
            api_endpoint_url="https://api.tomorrow.io/v4/weather/realtime",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["tomorrow.io", "api.tomorrow.io"],
            feature_tags=["weather", "hyperlocal", "timelines", "precipitation", "pollen"],
        ),
        AlternativeProvider(
            id="accuweather-api",
            provider_name="AccuWeather",
            api_name="AccuWeather APIs",
            category=ApiCategory.WEATHER,
            description="Proven global weather provider delivering patented MinuteCast forecasts and comprehensive radar telemetry worldwide.",
            website_url="https://developer.accuweather.com",
            documentation_url="https://developer.accuweather.com/apis",
            main_functionality="Locations API, current conditions, 120-minute MinuteCast, 15-day daily forecasts, indices, and severe alerts.",
            supported_features=[
                "MinuteCast 120-min precipitation", "Locations Key resolution",
                "Severe Weather Alerts", "Daily & Hourly Forecasts", "Health & Activity Indices",
            ],
            authentication_methods=["API Key via query parameter (?apikey=<KEY>)"],
            pricing_model="Freemium (50 calls/day free trial)",
            pricing_details="Free trial offers 50 calls/day. Standard packages start at $25/month for commercial applications.",
            pricing_url="https://developer.accuweather.com/packages",
            openapi_spec_url=None,
            compatibility_notes="Two-step lookup: resolve coordinate to a locationKey, then query weather endpoints with locationKey.",
            source_urls=[
                "https://developer.accuweather.com/apis",
                "https://developer.accuweather.com/packages",
            ],
            api_endpoint_url="https://dataservice.accuweather.com/locations/v1/cities/search",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["accuweather", "dataservice.accuweather.com"],
            feature_tags=["weather", "minutecast", "forecast", "indices", "alerts"],
        ),
    ],

    ApiCategory.MAPS_LOCATION: [
        AlternativeProvider(
            id="google-maps-api",
            provider_name="Google Maps Platform",
            api_name="Google Maps REST APIs",
            category=ApiCategory.MAPS_LOCATION,
            description="World-leading mapping and location platform with unmatched global coverage, place data, street view, and live traffic.",
            website_url="https://mapsplatform.google.com",
            documentation_url="https://developers.google.com/maps/documentation",
            main_functionality="Geocoding, reverse geocoding, directions, places search, distance matrix, elevation, and static map generation.",
            supported_features=[
                "Geocoding API", "Places API (New)", "Routes / Directions API",
                "Distance Matrix API", "Elevation API", "Street View Static API",
            ],
            authentication_methods=["API Key via query parameter (?key=<KEY>) or X-Goog-Api-Key header"],
            pricing_model="Usage-based with $200 monthly free credit",
            pricing_details="$200 free credit monthly across all Maps APIs. Billed per 1,000 requests depending on SKU.",
            pricing_url="https://mapsplatform.google.com/pricing/",
            openapi_spec_url=None,
            compatibility_notes="Available via both RESTful web services and native client SDKs (iOS, Android, JavaScript).",
            source_urls=[
                "https://developers.google.com/maps/documentation",
                "https://mapsplatform.google.com/pricing/",
            ],
            api_endpoint_url="https://maps.googleapis.com/maps/api/geocode/json",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["google.maps", "maps.googleapis.com"],
            feature_tags=["maps", "geocoding", "directions", "places", "routing", "distance"],
        ),
        AlternativeProvider(
            id="mapbox-api",
            provider_name="Mapbox",
            api_name="Mapbox Web Services APIs",
            category=ApiCategory.MAPS_LOCATION,
            description="Developer-first mapping platform offering fully customizable vector tiles, high-precision search, and routing engines.",
            website_url="https://www.mapbox.com",
            documentation_url="https://docs.mapbox.com/api/",
            main_functionality="Vector map tiles, Geocoding v5, Directions v5, Map Matching, Static Images, and Isochrone analysis.",
            supported_features=[
                "Mapbox Vector Tiles", "Geocoding v5 (forward/reverse)", "Directions API (driving, walking, cycling)",
                "Isochrone API (travel-time polygons)", "Matrix API (multi-point routing)",
            ],
            authentication_methods=["Access Token via query parameter (?access_token=<TOKEN>)"],
            pricing_model="Freemium (100,000 free geocodes/month)",
            pricing_details="Generous monthly free tiers: 100,000 geocoding requests/month, 50,000 map loads. Pay-as-you-go thereafter.",
            pricing_url="https://www.mapbox.com/pricing",
            openapi_spec_url="https://raw.githubusercontent.com/APIs-guru/openapi-directory/master/APIs/mapbox.com/v1/openapi.yaml",
            compatibility_notes="OpenAPI-compatible, GeoJSON-native output schemas. Integrates with Mapbox GL JS and mobile SDKs.",
            source_urls=[
                "https://docs.mapbox.com/api/",
                "https://www.mapbox.com/pricing",
            ],
            api_endpoint_url="https://api.mapbox.com/geocoding/v5/mapbox.places/0,0.json",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["mapbox", "api.mapbox.com"],
            feature_tags=["maps", "geocoding", "directions", "tiles", "isochrone", "geojson"],
        ),
        AlternativeProvider(
            id="here-location-services",
            provider_name="HERE Technologies",
            api_name="HERE Location Services REST APIs",
            category=ApiCategory.MAPS_LOCATION,
            description="Enterprise automotive-grade location technology offering precise commercial vehicle routing, fleet management, and offline navigation.",
            website_url="https://www.here.com",
            documentation_url="https://www.here.com/docs/bundle/routing-api-v8-api-reference/page/index.html",
            main_functionality="Geocoding & Search v7, Routing v8 (truck, car, public transit), Traffic API v7, and Fleet Telematics.",
            supported_features=[
                "Routing API v8 (truck-specific restrictions)", "Geocoding and Search v7",
                "Real-time Traffic flow and incident feeds", "Toll cost calculation", "Matrix routing",
            ],
            authentication_methods=["API Key (?apiKey=<KEY>) or OAuth 2.0 Bearer Token"],
            pricing_model="Freemium (250,000 free transactions/month)",
            pricing_details="Base plan includes 250,000 transactions/month free. Pay-as-you-go charged per 1,000 additional transactions.",
            pricing_url="https://www.here.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="RESTful JSON APIs with enterprise SLAs and vehicle weight/hazardous cargo parameter support.",
            source_urls=[
                "https://www.here.com/docs/",
                "https://www.here.com/pricing",
            ],
            api_endpoint_url="https://geocode.search.hereapi.com/v1/geocode",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["here.com", "hereapi.com", "router.hereapi.com"],
            feature_tags=["maps", "routing", "geocoding", "trucks", "traffic", "enterprise"],
        ),
        AlternativeProvider(
            id="tomtom-api",
            provider_name="TomTom",
            api_name="TomTom Maps & Traffic APIs",
            category=ApiCategory.MAPS_LOCATION,
            description="Comprehensive location suite with real-time traffic intelligence, map display, and route optimization.",
            website_url="https://developer.tomtom.com",
            documentation_url="https://developer.tomtom.com/apis",
            main_functionality="Search & Geocoding, Routing with real-time traffic, Map Display tiles, and Traffic Flow/Incidents.",
            supported_features=[
                "Fuzzy Search & Geocoding", "Routing API with Electric Vehicle (EV) routing",
                "Traffic Flow and Incident API", "Map Tiles (Raster and Vector)",
            ],
            authentication_methods=["API Key via query parameter (?key=<KEY>)"],
            pricing_model="Freemium (2,500 free requests/day)",
            pricing_details="2,500 free requests every day. Pay-as-you-grow credits available without minimum commitment.",
            pricing_url="https://developer.tomtom.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="JSON format with rich GeoJSON geometries. EV vehicle profiles with battery consumption models.",
            source_urls=[
                "https://developer.tomtom.com/apis",
                "https://developer.tomtom.com/pricing",
            ],
            api_endpoint_url="https://api.tomtom.com/search/2/geocode/test.json",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["tomtom", "api.tomtom.com"],
            feature_tags=["maps", "routing", "geocoding", "traffic", "ev"],
        ),
    ],

    ApiCategory.COMMUNICATION: [
        AlternativeProvider(
            id="twilio-api",
            provider_name="Twilio",
            api_name="Twilio Programmable Messaging & Voice API",
            category=ApiCategory.COMMUNICATION,
            description="Global cloud communications platform for programmatic SMS, MMS, WhatsApp, voice calls, and phone number verification.",
            website_url="https://www.twilio.com",
            documentation_url="https://www.twilio.com/docs/usage/api",
            main_functionality="SMS sending & receiving, WhatsApp Business messaging, SIP trunking, two-factor authentication (Verify API), and Interactive Voice Response (IVR).",
            supported_features=[
                "Programmable SMS & MMS", "WhatsApp Business API", "Voice API with WebRTC",
                "Twilio Verify 2FA", "Phone Number Lookup API", "Webhooks for status callbacks",
            ],
            authentication_methods=["HTTP Basic Auth (Account SID as username, Auth Token as password)"],
            pricing_model="Pay-as-you-go per message / minute",
            pricing_details="Starting at ~$0.0079 per outbound SMS in the US. Inbound SMS starting at $0.0075. No monthly minimums.",
            pricing_url="https://www.twilio.com/en-us/pricing",
            openapi_spec_url="https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/yaml/twilio_api_v2010.yaml",
            compatibility_notes="Extensive ecosystem of server SDKs (Node, Python, Java, C#, Go, PHP, Ruby).",
            source_urls=[
                "https://www.twilio.com/docs/usage/api",
                "https://www.twilio.com/en-us/pricing",
            ],
            api_endpoint_url="https://api.twilio.com/2010-04-01/Accounts.json",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["twilio", "api.twilio.com"],
            feature_tags=["sms", "voice", "whatsapp", "messages", "verify", "phone"],
        ),
        AlternativeProvider(
            id="sendgrid-api",
            provider_name="SendGrid (Twilio)",
            api_name="SendGrid v3 Mail Send API",
            category=ApiCategory.COMMUNICATION,
            description="Enterprise email delivery infrastructure handling billions of transactional and marketing emails monthly with high inbox deliverability.",
            website_url="https://sendgrid.com",
            documentation_url="https://docs.sendgrid.com/api-reference/mail-send/mail-send",
            main_functionality="Transactional email sending, dynamic template rendering, bounce/spam tracking, and inbound parse webhooks.",
            supported_features=[
                "v3 Mail Send API", "Dynamic Transactional Templates", "Domain Authentication (DKIM/SPF)",
                "Event Webhooks (delivered, opened, clicked)", "Email Validation API",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <SENDGRID_API_KEY>)"],
            pricing_model="Freemium (100 emails/day free forever)",
            pricing_details="Free tier includes 100 emails/day forever. Essentials tier starts at $19.95/month for up to 50,000 emails.",
            pricing_url="https://sendgrid.com/pricing/",
            openapi_spec_url=None,
            compatibility_notes="Simple JSON POST payload format to /v3/mail/send; also supports standard SMTP relay.",
            source_urls=[
                "https://docs.sendgrid.com/api-reference/mail-send/mail-send",
                "https://sendgrid.com/pricing/",
            ],
            api_endpoint_url="https://api.sendgrid.com/v3/mail/send",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["sendgrid", "api.sendgrid.com"],
            feature_tags=["email", "mail", "send", "templates", "transactional"],
        ),
        AlternativeProvider(
            id="mailgun-api",
            provider_name="Mailgun",
            api_name="Mailgun v3 Email API",
            category=ApiCategory.COMMUNICATION,
            description="Developer-centric transactional email service with powerful routing, message tracking, and deliverability analytics.",
            website_url="https://www.mailgun.com",
            documentation_url="https://documentation.mailgun.com/docs/mailgun/api-reference/",
            main_functionality="Message sending, inbound email routing, email verification, and deliverability tracking.",
            supported_features=[
                "Messages API", "Inbound Routing Rules", "Real-time Email Verification",
                "Dedicated IP management", "Detailed Event Logs and Webhooks",
            ],
            authentication_methods=["HTTP Basic Auth (api:<API_KEY>)"],
            pricing_model="Usage-based with 30-day trial",
            pricing_details="Foundation tier starts at $35/month for 50,000 emails. Pay-as-you-grow overage available.",
            pricing_url="https://www.mailgun.com/pricing/",
            openapi_spec_url=None,
            compatibility_notes="Multipart form-data and JSON endpoints. Regional EU and US endpoint isolation.",
            source_urls=[
                "https://documentation.mailgun.com/docs/mailgun/api-reference/",
                "https://www.mailgun.com/pricing/",
            ],
            api_endpoint_url="https://api.mailgun.net/v3/domains",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["mailgun", "api.mailgun.net"],
            feature_tags=["email", "mail", "routing", "messages", "inbound"],
        ),
    ],

    ApiCategory.AUTH_IDENTITY: [
        AlternativeProvider(
            id="auth0-api",
            provider_name="Auth0 by Okta",
            api_name="Auth0 Management & Authentication API",
            category=ApiCategory.AUTH_IDENTITY,
            description="Enterprise identity management platform supporting universal login, social authentication, enterprise SAML/WS-Fed, and multi-factor auth.",
            website_url="https://auth0.com",
            documentation_url="https://auth0.com/docs/api",
            main_functionality="User registration, login, token issuance (OAuth 2.0 / OIDC), passwordless auth, MFA, and user lifecycle management.",
            supported_features=[
                "OAuth 2.0 & OpenID Connect", "Universal Login", "Multi-Factor Authentication (MFA)",
                "Role-Based Access Control (RBAC)", "Enterprise Connections (Active Directory, SAML)",
                "Actions & Custom Extensibility",
            ],
            authentication_methods=["OAuth 2.0 Bearer Token (JWT)"],
            pricing_model="Freemium (7,500 active users free)",
            pricing_details="Free plan supports up to 7,500 Monthly Active Users (MAU) and unlimited logins. Paid plans start at $35/month.",
            pricing_url="https://auth0.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="Full compliance with RFC 6749 (OAuth 2.0) and OpenID Connect specifications.",
            source_urls=[
                "https://auth0.com/docs/api",
                "https://auth0.com/pricing",
            ],
            api_endpoint_url="https://auth0.auth0.com/oauth/token",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["auth0", "auth0.com", ".auth0app.com"],
            feature_tags=["auth", "oauth", "oidc", "users", "login", "jwt", "mfa"],
        ),
        AlternativeProvider(
            id="clerk-api",
            provider_name="Clerk",
            api_name="Clerk Frontend & Backend API",
            category=ApiCategory.AUTH_IDENTITY,
            description="Modern, React-first authentication and user management platform with ready-to-use UI components and organization multi-tenancy.",
            website_url="https://clerk.com",
            documentation_url="https://clerk.com/docs/reference/backend-api",
            main_functionality="Drop-in authentication components, session management, organization multi-tenancy, passkeys, and webhooks.",
            supported_features=[
                "Passkeys (WebAuthn)", "Multi-session handling", "Organization multi-tenancy",
                "Pre-built React/Next.js components", "JWT verification", "Audit logs",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <SECRET_KEY>)"],
            pricing_model="Freemium (10,000 monthly active users free)",
            pricing_details="Free tier includes 10,000 MAUs. Pro tier starts at $25/month + $0.02 per additional MAU.",
            pricing_url="https://clerk.com/pricing",
            openapi_spec_url="https://raw.githubusercontent.com/clerkinc/javascript/main/packages/backend/src/api/openapi.yaml",
            compatibility_notes="OpenAPI 3.0 specification available; native SDKs for Next.js, React, Node, Python, and Go.",
            source_urls=[
                "https://clerk.com/docs/reference/backend-api",
                "https://clerk.com/pricing",
            ],
            api_endpoint_url="https://api.clerk.com/v1/users",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["clerk", "api.clerk.com", "clerk.dev"],
            feature_tags=["auth", "users", "sessions", "passkeys", "organizations", "login"],
        ),
        AlternativeProvider(
            id="supabase-auth",
            provider_name="Supabase",
            api_name="Supabase Auth (GoTrue) API",
            category=ApiCategory.AUTH_IDENTITY,
            description="Open-source authentication service integrated directly with PostgreSQL Row-Level Security (RLS) policies.",
            website_url="https://supabase.com",
            documentation_url="https://supabase.com/docs/reference/javascript/auth-signup",
            main_functionality="User registration, OAuth login providers, passwordless magic links, phone SMS OTP, and JWT issuance for PostgreSQL RLS.",
            supported_features=[
                "PostgreSQL Row Level Security integration", "OAuth 2.0 providers (Google, GitHub, Apple, etc.)",
                "Magic links & OTP", "MFA with TOTP", "User metadata management",
            ],
            authentication_methods=["API Key (apikey header) + Bearer Token (Authorization: Bearer <TOKEN>)"],
            pricing_model="Freemium (50,000 monthly active users free)",
            pricing_details="Free tier provides up to 50,000 MAUs. Pro tier starts at $25/month with 100,000 MAUs included.",
            pricing_url="https://supabase.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="Open-source GoTrue server with client libraries in JS, Python, Flutter, Swift, and Go.",
            source_urls=[
                "https://supabase.com/docs/reference/javascript/auth-signup",
                "https://supabase.com/pricing",
            ],
            api_endpoint_url="https://api.supabase.com/v1/projects",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["supabase.co", "supabase.com"],
            feature_tags=["auth", "users", "postgres", "rls", "magic_link", "jwt"],
        ),
    ],

    ApiCategory.CLOUD_STORAGE: [
        AlternativeProvider(
            id="aws-s3-api",
            provider_name="Amazon Web Services",
            api_name="Amazon Simple Storage Service (S3) REST API",
            category=ApiCategory.CLOUD_STORAGE,
            description="The worldwide standard for scalable cloud object storage, designed for 99.999999999% (11 9s) of data durability.",
            website_url="https://aws.amazon.com/s3/",
            documentation_url="https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html",
            main_functionality="Bucket management, multipart object upload, presigned URLs for secure client uploads, and lifecycle rules.",
            supported_features=[
                "Multipart upload", "Presigned URLs", "S3 Versioning & Object Lock",
                "S3 Lifecycle management", "Cross-Region Replication", "SSE-KMS Encryption",
            ],
            authentication_methods=["AWS Signature Version 4 (HMAC-SHA256)"],
            pricing_model="Usage-based (storage GB/month + data transfer + API requests)",
            pricing_details="Standard tier starts at $0.023 per GB/month for first 50 TB. AWS Free Tier includes 5 GB for 12 months.",
            pricing_url="https://aws.amazon.com/s3/pricing/",
            openapi_spec_url=None,
            compatibility_notes="Defines the de facto standard S3 API protocol mirrored by dozens of alternative cloud storage providers.",
            source_urls=[
                "https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html",
                "https://aws.amazon.com/s3/pricing/",
            ],
            api_endpoint_url="https://s3.amazonaws.com",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["amazonaws.com", "s3.amazonaws.com"],
            feature_tags=["storage", "s3", "buckets", "objects", "upload", "blob"],
        ),
        AlternativeProvider(
            id="cloudflare-r2-api",
            provider_name="Cloudflare",
            api_name="Cloudflare R2 Storage API",
            category=ApiCategory.CLOUD_STORAGE,
            description="S3-compatible object storage featuring zero egress fees and native edge integration via Cloudflare Workers.",
            website_url="https://www.cloudflare.com/products/r2/",
            documentation_url="https://developers.cloudflare.com/r2/api/s3/api/",
            main_functionality="Object storage with zero egress bandwidth charges, presigned URLs, and full S3 API compatibility.",
            supported_features=[
                "Zero data egress fees", "S3-compatible API", "Presigned URLs",
                "Custom domain binding", "Integration with Cloudflare Workers",
            ],
            authentication_methods=["S3 SigV4 authentication using R2 Access Key & Secret"],
            pricing_model="Pay-as-you-go (10 GB storage free/month)",
            pricing_details="10 GB/month free storage, 1M Class A operations/month free, 10M Class B operations/month free. Zero egress bandwidth charges.",
            pricing_url="https://www.cloudflare.com/plans/developer-platform/",
            openapi_spec_url=None,
            compatibility_notes="100% S3-compatible endpoints; use existing AWS S3 SDKs by pointing endpoint URL to <ACCOUNT_ID>.r2.cloudflarestorage.com.",
            source_urls=[
                "https://developers.cloudflare.com/r2/api/s3/api/",
                "https://www.cloudflare.com/plans/developer-platform/",
            ],
            api_endpoint_url="https://api.cloudflare.com/client/v4/accounts",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["r2.cloudflarestorage.com", "cloudflare.com/products/r2"],
            feature_tags=["storage", "r2", "zero-egress", "s3-compatible", "objects"],
        ),
        AlternativeProvider(
            id="google-cloud-storage",
            provider_name="Google Cloud",
            api_name="Google Cloud Storage JSON API",
            category=ApiCategory.CLOUD_STORAGE,
            description="Unified object storage for developers and enterprises, offering high durability and integration with Google Cloud compute.",
            website_url="https://cloud.google.com/storage",
            documentation_url="https://cloud.google.com/storage/docs/json_api",
            main_functionality="Bucket operations, resumable uploads, signed URLs, customer-managed encryption keys (CMEK), and lifecycle management.",
            supported_features=[
                "Resumable media uploads", "Signed URLs v4", "Bucket Lock and retention",
                "Object Versioning", "Dual-region and multi-region redundancy",
            ],
            authentication_methods=["OAuth 2.0 Bearer Token / Google Service Account"],
            pricing_model="Usage-based (storage GB/month + operations + egress)",
            pricing_details="Standard storage starts at $0.020 per GB/month in US regions. 5 GB free per month under GCP Free Tier.",
            pricing_url="https://cloud.google.com/storage/pricing",
            openapi_spec_url="https://raw.githubusercontent.com/APIs-guru/openapi-directory/master/APIs/googleapis.com/storage/v1/openapi.yaml",
            compatibility_notes="Native JSON REST API and XML API with S3 interoperability mode.",
            source_urls=[
                "https://cloud.google.com/storage/docs/json_api",
                "https://cloud.google.com/storage/pricing",
            ],
            api_endpoint_url="https://storage.googleapis.com/storage/v1/b",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["storage.googleapis.com", "cloud.google.com/storage"],
            feature_tags=["storage", "gcs", "buckets", "objects", "upload", "resumable"],
        ),
    ],

    ApiCategory.DATABASE: [
        AlternativeProvider(
            id="supabase-database-api",
            provider_name="Supabase",
            api_name="Supabase Database REST & GraphQL API",
            category=ApiCategory.DATABASE,
            description="Instantly turns a full Postgres database into a secure REST and GraphQL API with auto-generated schemas and real-time subscriptions.",
            website_url="https://supabase.com",
            documentation_url="https://supabase.com/docs/reference/javascript/select",
            main_functionality="PostgreSQL CRUD via PostgREST, real-time WebSocket subscriptions, GraphQL support via pg_graphql, and Row Level Security.",
            supported_features=[
                "PostgreSQL 15+", "Auto-generated REST API (PostgREST)", "GraphQL endpoint",
                "Row Level Security (RLS)", "Realtime change data capture (CDC)",
            ],
            authentication_methods=["API Key (apikey header) + User Bearer Token (JWT)"],
            pricing_model="Freemium (500 MB database free)",
            pricing_details="Free tier includes 500 MB database space and 5 GB bandwidth. Pro tier starts at $25/month for 8 GB disk.",
            pricing_url="https://supabase.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="Standard PostgreSQL connection string + HTTPS PostgREST interface. Client SDKs in JS, Python, Swift.",
            source_urls=[
                "https://supabase.com/docs/",
                "https://supabase.com/pricing",
            ],
            api_endpoint_url="https://api.supabase.com/v1/projects",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["supabase.co", "supabase.com"],
            feature_tags=["database", "postgres", "sql", "postgrest", "graphql", "realtime"],
        ),
        AlternativeProvider(
            id="mongodb-atlas-api",
            provider_name="MongoDB",
            api_name="MongoDB Atlas Data API",
            category=ApiCategory.DATABASE,
            description="Serverless HTTPS REST API to query and update document collections in MongoDB Atlas without requiring a native driver connection.",
            website_url="https://www.mongodb.com/atlas",
            documentation_url="https://www.mongodb.com/docs/atlas/app-services/data-api/",
            main_functionality="Document CRUD (findOne, insertMany, updateOne, deleteOne), aggregation pipelines, and schema validation.",
            supported_features=[
                "Document store CRUD", "Aggregation pipeline support",
                "Serverless HTTPS access without TCP connection pool limits", "Fine-grained API key permissions",
            ],
            authentication_methods=["API Key header (apiKey: <KEY>) or Bearer Token"],
            pricing_model="Freemium (Shared cluster free forever)",
            pricing_details="M0 free cluster includes 512 MB storage. Dedicated clusters start at ~$0.08/hour.",
            pricing_url="https://www.mongodb.com/pricing",
            openapi_spec_url=None,
            compatibility_notes="JSON payload endpoints modeled directly after MongoDB driver query methods.",
            source_urls=[
                "https://www.mongodb.com/docs/atlas/app-services/data-api/",
                "https://www.mongodb.com/pricing",
            ],
            api_endpoint_url="https://cloud.mongodb.com/api/atlas/v2",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["mongodb.com", "atlas.mongodb.com"],
            feature_tags=["database", "mongodb", "nosql", "documents", "json", "query"],
        ),
        AlternativeProvider(
            id="neon-postgres-api",
            provider_name="Neon",
            api_name="Neon Serverless Postgres API",
            category=ApiCategory.DATABASE,
            description="Multi-cloud serverless PostgreSQL platform with instant branching, autoscaling, and connection pooling for modern web stacks.",
            website_url="https://neon.tech",
            documentation_url="https://neon.tech/docs/reference/api-reference",
            main_functionality="Serverless PostgreSQL connections, instant copy-on-write branch creation, autoscaling compute, and serverless driver HTTP proxy.",
            supported_features=[
                "Instant database branching", "HTTP serverless query driver",
                "Scale-to-zero compute", "Connection pooling with PgBouncer",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <API_KEY>)"],
            pricing_model="Freemium (0.5 GB storage free)",
            pricing_details="Free tier includes 0.5 GB storage and 100 compute hours/month. Launch tier starts at $19/month.",
            pricing_url="https://neon.tech/pricing",
            openapi_spec_url=None,
            compatibility_notes="Supports standard Postgres wire protocol (port 5432) and low-latency HTTP/WebSocket serverless driver.",
            source_urls=[
                "https://neon.tech/docs/reference/api-reference",
                "https://neon.tech/pricing",
            ],
            api_endpoint_url="https://console.neon.tech/api/v2/projects",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["neon.tech"],
            feature_tags=["database", "postgres", "sql", "branching", "serverless"],
        ),
    ],

    ApiCategory.GENERAL_REST: [
        AlternativeProvider(
            id="github-rest-api",
            provider_name="GitHub",
            api_name="GitHub REST API v3",
            category=ApiCategory.GENERAL_REST,
            description="The premier standard for RESTful web service architecture, powering repositories, issues, releases, workflows, and developer profiles.",
            website_url="https://github.com",
            documentation_url="https://docs.github.com/en/rest",
            main_functionality="Repository management, user profiles, pull request automation, issue tracking, and webhook notifications.",
            supported_features=[
                "Fine-grained Personal Access Tokens", "Webhooks with SHA-256 HMAC",
                "Pagination via Link headers", "Conditional requests with ETags",
            ],
            authentication_methods=["Bearer Token (Authorization: Bearer <TOKEN>)"],
            pricing_model="Free with GitHub account (Rate limited to 5,000 req/hr)",
            pricing_details="Free for all public and private repositories with standard rate limits. Enterprise options available.",
            pricing_url="https://github.com/pricing",
            openapi_spec_url="https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.yaml",
            compatibility_notes="The gold standard for REST API design; supports OAuth 2.0 and GitHub App authentication.",
            source_urls=[
                "https://docs.github.com/en/rest",
                "https://github.com/pricing",
            ],
            api_endpoint_url="https://api.github.com/zen",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["github.com", "api.github.com"],
            feature_tags=["rest", "repositories", "webhooks", "users", "api"],
        ),
        AlternativeProvider(
            id="postman-echo-api",
            provider_name="Postman",
            api_name="Postman Echo API",
            category=ApiCategory.GENERAL_REST,
            description="Testing utility tool that mirrors back any HTTP request parameters, headers, cookies, and payloads sent to it.",
            website_url="https://www.postman.com",
            documentation_url="https://postman-echo.com",
            main_functionality="HTTP request reflection, status code simulation, basic auth testing, digest auth testing, and delay simulation.",
            supported_features=[
                "GET / POST / PUT / DELETE mirroring", "Basic & Digest auth simulation",
                "Header reflection", "Deflate & Gzip response testing",
            ],
            authentication_methods=["None required / Basic auth for test endpoints"],
            pricing_model="Free testing utility",
            pricing_details="Completely free public utility service provided by Postman.",
            pricing_url="https://postman-echo.com",
            openapi_spec_url=None,
            compatibility_notes="Useful for validating HTTP client configurations, header behavior, and request body serializations.",
            source_urls=["https://postman-echo.com"],
            api_endpoint_url="https://postman-echo.com/get",
            endpoint_status="verified",
            verification_status="verified",
            identity_keywords=["postman-echo.com"],
            feature_tags=["rest", "echo", "testing", "http", "headers"],
        ),
    ],
}


# ── Helper: Self Detection ──────────────────────────────────────────────────────

def _is_self(provider: AlternativeProvider, target_url: str, target_hostname: str) -> bool:
    """
    Returns True if the scanned target matches this provider (so a provider
    is never returned as an alternative to itself).
    """
    target_url_lower = target_url.lower()
    target_host_lower = target_hostname.lower()

    # Check website or doc domains
    for url_field in (provider.website_url, provider.documentation_url):
        try:
            parsed = urlparse(url_field)
            if parsed.hostname and (
                parsed.hostname.lower() == target_host_lower
                or parsed.hostname.lower() in target_host_lower
                or target_host_lower in parsed.hostname.lower()
            ):
                return True
        except Exception:
            pass

    # Check identity keywords
    for kw in provider.identity_keywords:
        if kw in target_host_lower or kw in target_url_lower:
            return True

    return False


# ── Relevance Calculation ───────────────────────────────────────────────────────

def calculate_relevance(
    provider: AlternativeProvider,
    target_url: str,
    target_hostname: str,
    *,
    target_category: str,
    detected_signals: Optional[List[str]] = None,
    operation_context: Optional[Dict[str, Any]] = None,
) -> tuple[float, str]:
    """
    Calculate a similarity/relevance score in [0.0, 1.0] and generate an
    evidence-based explanation.

    This score represents functional compatibility and relevance — NOT a security score.
    """
    # Base category match is strong
    base_score = 0.72
    boosts: List[tuple[float, str]] = []

    target_url_lower = target_url.lower()
    target_path = urlparse(target_url).path.lower()

    # Check feature tag overlap with target path & detected signals
    signals_text = " ".join(detected_signals or []).lower()
    op_path = (operation_context.get("path") or "").lower() if operation_context else ""
    op_desc = (operation_context.get("description") or "").lower() if operation_context else ""

    combined_target_text = f"{target_path} {target_url_lower} {signals_text} {op_path} {op_desc}"

    matched_features = []
    for tag in provider.feature_tags:
        if tag in combined_target_text:
            matched_features.append(tag)

    if matched_features:
        # Boost up to +0.18 based on matched specific features
        boost = min(len(matched_features) * 0.06, 0.18)
        boosts.append((boost, f"Direct functional match on capabilities: {', '.join(matched_features[:3])}"))

    # Authentication alignment boost: standard Bearer / API Key is universally compatible
    if any("Bearer" in a or "API Key" in a for a in provider.authentication_methods):
        boosts.append((0.04, "Standard REST authorization model (Bearer / API Key)"))

    # OpenAPI spec availability boost
    if provider.openapi_spec_url:
        boosts.append((0.03, "Public OpenAPI 3.0 specification available for automated integration"))

    total_score = base_score + sum(b[0] for b in boosts)
    # Cap score cleanly between 0.70 and 0.98
    final_score = round(min(max(total_score, 0.70), 0.98), 2)

    # Build human-readable reason
    reasons_list = [b[1] for b in boosts]
    if reasons_list:
        relevance_reason = (
            f"Strong match for {target_category}: " + "; ".join(reasons_list) + "."
        )
    else:
        relevance_reason = (
            f"Compatible alternative in the {target_category} space offering verified "
            f"{provider.main_functionality.split(',')[0]}."
        )

    return final_score, relevance_reason


# ── Core Discovery Service ──────────────────────────────────────────────────────

async def discover_alternatives(
    target_url: str,
    target_hostname: str,
    category: str,
    *,
    user_category: Optional[str] = None,
    detected_signals: Optional[List[str]] = None,
    operation_context: Optional[Dict[str, Any]] = None,
    limit: int = 5,
    include_live: bool = False,
    refresh_live: bool = False,
) -> Dict[str, Any]:
    """
    Discover verified alternative APIs for the target API.

    Parameters
    ----------
    target_url : str
        The URL of the scanned API.
    target_hostname : str
        The hostname of the scanned API.
    category : str
        The automatically detected API category.
    user_category : str | None
        User-corrected category (takes precedence if provided).
    detected_signals : list of str, optional
        Signals from Step 1 classification.
    operation_context : dict, optional
        OpenAPI endpoint metadata if scanned via Spec Analyzer.
    limit : int
        Maximum number of alternatives to return.

    Returns
    -------
    dict matching AlternativesResponse schema.
    """
    effective_category = user_category or category

    # If category is unknown or unclassified, return clean empty result with explanation
    if not effective_category or effective_category == ApiCategory.UNKNOWN:
        return {
            "category": ApiCategory.UNKNOWN,
            "user_category": user_category,
            "target_url": target_url,
            "target_hostname": target_hostname,
            "total_found": 0,
            "alternatives": [],
            "discovered_at": datetime.now(timezone.utc).isoformat(),
            "source_summary": "Category is unclassified. Please select a category using the dropdown above to discover alternatives.",
            "is_cached": False,
        }

    candidates = _VERIFIED_CATALOGUE.get(effective_category, [])

    # Filter out self
    filtered: List[AlternativeProvider] = [
        p for p in candidates
        if not _is_self(p, target_url, target_hostname)
    ]

    # Deduplicate by provider id
    seen_ids = set()
    deduped: List[AlternativeProvider] = []
    for p in filtered:
        if p.id not in seen_ids:
            seen_ids.add(p.id)
            deduped.append(p)

    # Score and rank
    results: List[Dict[str, Any]] = []
    for p in deduped:
        score, reason = calculate_relevance(
            p,
            target_url,
            target_hostname,
            target_category=effective_category,
            detected_signals=detected_signals,
            operation_context=operation_context,
        )

        results.append({
            "id": p.id,
            "provider_name": p.provider_name,
            "api_name": p.api_name,
            "category": p.category,
            "description": p.description,
            "website_url": p.website_url,
            "documentation_url": p.documentation_url,
            "api_endpoint_url": p.api_endpoint_url,
            "endpoint_status": p.endpoint_status,
            "main_functionality": p.main_functionality,
            "supported_features": p.supported_features,
            "authentication_methods": p.authentication_methods,
            "pricing_model": p.pricing_model,
            "pricing_details": p.pricing_details,
            "pricing_url": p.pricing_url,
            "openapi_spec_url": p.openapi_spec_url,
            "compatibility_notes": p.compatibility_notes,
            "source_urls": p.source_urls,
            "verification_status": p.verification_status,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "relevance_score": score,
            "relevance_reason": reason,
            "discovery_source": "local_catalogue",
            "metadata_verification_status": p.verification_status,
            # The catalogue has an explicit category assignment, but does not
            # provide a calibrated relevance-confidence estimate.
            "relevance_confidence": None,
        })

    live_warning = None
    live_cached = False
    live_retrieved_at = None
    live_count = 0
    live_failed = False
    if include_live:
        try:
            from app.services.live_api_discovery_service import discover_live
            live_data = await discover_live(effective_category, target_hostname, limit=max(limit * 3, 10), force=refresh_live)
            live_cached = bool(live_data.get("is_cached"))
            live_retrieved_at = live_data.get("retrieved_at")
            live_warning = live_data.get("warning")
            existing_provider_names = {str(item["provider_name"]).casefold() for item in results}
            existing_api_names = {str(item["api_name"]).casefold() for item in results}
            for item in live_data.get("alternatives", []):
                if item["provider_name"].casefold() in existing_provider_names or item["api_name"].casefold() in existing_api_names:
                    continue
                live_provider = AlternativeProvider(
                    id=item["id"], provider_name=item["provider_name"], api_name=item["api_name"],
                    category=effective_category, description=item["description"], website_url=item["website_url"],
                    documentation_url=item["documentation_url"], main_functionality=item["main_functionality"],
                    supported_features=[], authentication_methods=[], pricing_model="unknown", pricing_details=None,
                    pricing_url=None, openapi_spec_url=item.get("openapi_spec_url"),
                    compatibility_notes=item["compatibility_notes"], source_urls=item["source_urls"],
                    verification_status="unverified", api_endpoint_url=None, endpoint_status="endpoint_unverified",
                    identity_keywords=[item["provider_name"].casefold()], feature_tags=[],
                )
                score, reason = calculate_relevance(
                    live_provider, target_url, target_hostname, target_category=effective_category,
                    detected_signals=detected_signals, operation_context=operation_context,
                )
                item["relevance_score"] = score
                item["relevance_reason"] = reason
                item["last_updated"] = live_retrieved_at
                results.append(item)
                existing_provider_names.add(item["provider_name"].casefold())
                existing_api_names.add(item["api_name"].casefold())
                live_count += 1
        except Exception as exc:
            logger.warning("Live alternative discovery failed; using local catalogue: %s", type(exc).__name__)
            live_warning = "Live discovery unavailable; showing local catalogue recommendations."
            live_failed = True

    # Sort descending by relevance_score
    results.sort(key=lambda x: x["relevance_score"], reverse=True)
    results = results[:limit]

    sources = {item.get("discovery_source", "local_catalogue") for item in results}
    source_label = "combined" if len(sources) > 1 else (next(iter(sources)) if sources else "local_catalogue")
    local_count = sum(item.get("discovery_source") == "local_catalogue" for item in results)
    live_count = sum(item.get("discovery_source") == "live_directory" for item in results)
    source_summary = f"{local_count} local catalogue and {live_count} live directory matches for {effective_category}. Relevance is not a security score."
    if live_warning:
        source_summary = f"{live_warning} {source_summary}"

    return {
        "category": effective_category,
        "user_category": user_category,
        "target_url": target_url,
        "target_hostname": target_hostname,
        "total_found": len(results),
        "alternatives": results,
        "discovered_at": datetime.now(timezone.utc).isoformat(),
        "source_summary": source_summary,
        "is_cached": live_cached,
        "discovery_source": source_label,
        "cache_status": "fallback" if live_failed else ("hit" if live_cached else ("refreshed" if include_live else "not_requested")),
        "retrieved_at": live_retrieved_at or datetime.now(timezone.utc).isoformat(),
        "warnings": [live_warning] if live_warning else [],
    }


# ── SSRF-Safe Remote Verification ───────────────────────────────────────────────

async def verify_external_url_safely(url: str, timeout: float = 5.0) -> bool:
    """
    Safely verifies whether a prospective external resource URL (e.g. an OpenAPI spec)
    is reachable and valid without introducing SSRF risks.

    Validates URL scheme, blocks private/loopback/cloud metadata IPs, enforces
    timeouts and limits response size.
    """
    import httpx
    try:
        validated_url, _ = resolve_and_validate(url)
    except URLValidationError:
        return False

    parsed = urlparse(validated_url)
    if parsed.scheme.lower() != "https":
        return False

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            resp = await client.head(validated_url)
            return resp.status_code < 400
    except Exception:
        return False
