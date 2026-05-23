"""Application configuration loaded from environment variables."""

from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    anthropic_api_key: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "aria"
    langsmith_tracing: bool = False
    llm_mode: Literal["mock", "live"] = "mock"
    sonnet_model: str = "claude-sonnet-4-6"
    haiku_model: str = "claude-haiku-4-5"

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

    # App
    app_env: Literal["development", "test", "staging", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173"

    @field_validator("cors_origins")
    @classmethod
    def _strip_origins(cls, v: str) -> str:
        return v.strip()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_test(self) -> bool:
        return self.app_env == "test"


@lru_cache
def get_settings() -> Settings:
    return Settings()
