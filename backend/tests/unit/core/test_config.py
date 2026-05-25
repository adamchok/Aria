"""Configuration loading and validation."""

from __future__ import annotations

import os
from decimal import Decimal

from app.core.config import Settings


def test_defaults_load():
    s = Settings(_env_file=None)
    assert s.base_currency == "MYR"
    assert s.fx_variance_buffer_pct == Decimal("0.015")
    assert s.match_confidence_threshold == 0.75
    assert s.extraction_escalation_threshold == 0.5
    assert s.llm_mode in {"mock", "live"}


def test_cors_origin_list_parsing():
    s = Settings(_env_file=None, cors_origins="http://a.example, http://b.example ")
    assert s.cors_origin_list == ["http://a.example", "http://b.example"]


def test_decimal_buffer_parses_from_env(monkeypatch):
    monkeypatch.setenv("FX_VARIANCE_BUFFER_PCT", "0.02")
    s = Settings(_env_file=None)
    assert s.fx_variance_buffer_pct == Decimal("0.02")


def test_admin_api_key_from_env(monkeypatch):
    monkeypatch.setenv("ADMIN_API_KEY", "my-admin-secret")
    s = Settings(_env_file=None)
    assert s.admin_api_key == "my-admin-secret"


def test_live_llm_requires_anthropic_key():
    import pytest

    with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
        Settings(_env_file=None, llm_mode="live", anthropic_api_key="")


def test_live_llm_accepts_anthropic_key():
    s = Settings(_env_file=None, llm_mode="live", anthropic_api_key="sk-ant-test")
    assert s.llm_mode == "live"
