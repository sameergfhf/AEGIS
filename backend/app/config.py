"""
app/config.py — Application settings loaded from environment variables.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"
_ROOT_ENV_FILE = _BACKEND_DIR.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_ENV_FILE, _ROOT_ENV_FILE, ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_env: str = "development"
    secret_key: str = "change-me"
    allowed_origins: str = "http://localhost:3000,http://localhost:5173,http://localhost:4173"

    # Database
    database_url: str = "sqlite+aiosqlite:///./api_sentinel.db"

    # Scanner limits
    scan_latency_samples: int = 5
    max_response_bytes: int = 524_288  # 512 KB
    request_timeout_seconds: int = 15
    max_redirects: int = 5
    max_concurrent_scans: int = 10
    scan_rate_limit_per_minute: int = 20

    # Threat intelligence
    virustotal_api_key: str = ""
    google_safe_browsing_api_key: str = ""

    # Reports
    report_retention_days: int = 30

    # OAuth & Native Auth
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 1 day (24 hours)

    # Optional evidence-grounded AI provider (OpenAI-compatible Chat Completions API).
    ai_provider_api_key: str = ""
    ai_provider_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def virustotal_enabled(self) -> bool:
        return bool(self.virustotal_api_key)

    @property
    def safe_browsing_enabled(self) -> bool:
        return bool(self.google_safe_browsing_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
