"""LLM rate-limit retry helper tests."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.agents.sdk.llm_retry import call_with_rate_limit_retry, is_rate_limit_error
from app.core.config import Settings


def test_is_rate_limit_error_by_status_code():
    exc = Exception("rate limited")
    exc.status_code = 429  # type: ignore[attr-defined]
    assert is_rate_limit_error(exc) is True


def test_is_rate_limit_error_by_type_name():
    class RateLimitError(Exception):
        pass

    assert is_rate_limit_error(RateLimitError("too many")) is True


def test_is_rate_limit_error_false_for_other():
    assert is_rate_limit_error(ValueError("bad value")) is False
    assert is_rate_limit_error(RuntimeError("server error")) is False


def test_call_with_rate_limit_retry_succeeds_after_429():
    settings = Settings(llm_max_retries=2, llm_retry_base_seconds=0.01, llm_retry_tpm_base_seconds=0.01)
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        if calls["n"] == 1:
            exc = Exception("rate limited")
            exc.status_code = 429  # type: ignore[attr-defined]
            raise exc
        return "ok"

    with patch("app.agents.sdk.llm_retry.time.sleep"):
        assert call_with_rate_limit_retry(fn, settings=settings) == "ok"
    assert calls["n"] == 2


def test_call_with_rate_limit_retry_raises_after_exhausted():
    settings = Settings(llm_max_retries=1, llm_retry_base_seconds=0.01)

    def fn():
        exc = Exception("rate limited")
        exc.status_code = 429  # type: ignore[attr-defined]
        raise exc

    with patch("app.agents.sdk.llm_retry.time.sleep"):
        with pytest.raises(Exception, match="rate limited"):
            call_with_rate_limit_retry(fn, settings=settings)


def test_call_with_rate_limit_retry_no_retry_on_other_errors():
    settings = Settings(llm_max_retries=3)

    with patch("app.agents.sdk.llm_retry.time.sleep") as mock_sleep:
        with pytest.raises(ValueError, match="bad"):
            call_with_rate_limit_retry(lambda: (_ for _ in ()).throw(ValueError("bad")), settings=settings)
        mock_sleep.assert_not_called()
