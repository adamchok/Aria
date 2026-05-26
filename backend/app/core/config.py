"""Application configuration loaded from environment variables."""

from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_ROOT.parent


def _settings_env_files() -> tuple[str, ...]:
    """Repo root .env first, then backend/.env (later overrides earlier)."""
    return tuple(
        str(path)
        for path in (_REPO_ROOT / ".env", _BACKEND_ROOT / ".env")
        if path.is_file()
    )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_settings_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM
    anthropic_api_key: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "aria"
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_tracing: bool = False
    llm_mode: Literal["mock", "live"] = "mock"
    sonnet_model: str = "claude-sonnet-4-6"
    haiku_model: str = "claude-haiku-4-5-20251001"
    opus_model: str = "claude-opus-4-7"

    # Database
    database_url: str = "sqlite+aiosqlite:///./aria.db"

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Object storage
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "ariaadmin"
    s3_secret_key: str = "ariaadmin"
    s3_bucket: str = "aria-documents"
    s3_region: str = "us-east-1"
    s3_presign_ttl_seconds: int = 900
    # Set to AES256 on AWS S3; leave unset for MinIO (default Docker stack).
    s3_server_side_encryption: str | None = None

    # FX
    exchangerate_api_key: str = ""
    openexchangerates_app_id: str = ""
    fx_cache_ttl_seconds: int = 3600

    # Reconciliation tuning
    base_currency: str = "MYR"
    fx_variance_buffer_pct: Decimal = Decimal("0.015")
    match_confidence_threshold: float = 0.75
    extraction_escalation_threshold: float = 0.5
    match_review_floor: float = 0.5
    date_window_days: int = 5

    # Auth / multi-tenancy
    admin_api_key: str = ""  # Bootstrap key; required in production

    # JWT
    jwt_secret_key: str = "aria-dev-jwt-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440  # 24 hours

    # Default admin user seeded on first startup
    default_admin_email: str = "admin@aria.local"
    default_admin_password: str = ""  # Required to enable auto-seed

    # Ingestion pipeline (Celery Beat auto-batching)
    batch_size_threshold: int = 50
    batch_time_window_minutes: int = 15
    celery_beat_interval_minutes: int = 2

    # Webhooks
    webhook_max_retries: int = 3
    webhook_retry_backoff_base_seconds: int = 5
    webhook_secret_encryption_key: str = ""

    # Email notifications
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@aria.local"
    smtp_use_tls: bool = True
    notification_email_enabled: bool = False

    # App
    app_env: Literal["development", "test", "staging", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://localhost:5175"

    @field_validator("cors_origins")
    @classmethod
    def _strip_origins(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _validate_live_llm(self) -> Settings:
        if self.llm_mode == "live" and not self.anthropic_api_key.strip():
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_MODE=live")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_test(self) -> bool:
        return self.app_env == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()
