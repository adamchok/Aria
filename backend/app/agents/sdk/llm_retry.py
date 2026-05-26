"""Shared Anthropic rate-limit retry helpers."""

from __future__ import annotations

import random
import time
from collections.abc import Callable
from typing import TypeVar

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


def is_rate_limit_error(exc: Exception) -> bool:
    """Return True for HTTP 429 / RateLimit errors from the Anthropic SDK."""
    if hasattr(exc, "status_code") and exc.status_code == 429:
        return True
    name = type(exc).__name__.lower()
    return "ratelimit" in name or "rate_limit" in name


def retry_after_seconds(exc: Exception) -> float | None:
    """Parse Retry-After from an SDK error response when present."""
    response = getattr(exc, "response", None)
    if response is None:
        return None
    headers = getattr(response, "headers", None)
    if not headers:
        return None
    raw = headers.get("retry-after") or headers.get("Retry-After")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _backoff_delay(exc: Exception, attempt: int, settings: Settings) -> float:
    retry_after = retry_after_seconds(exc)
    if retry_after is not None and retry_after > 0:
        return retry_after + random.uniform(0, 0.5)
    if attempt >= 2:
        return settings.llm_retry_tpm_base_seconds + random.uniform(0, 2)
    return settings.llm_retry_base_seconds * (2**attempt) + random.uniform(0, 1)


def call_with_rate_limit_retry(
    fn: Callable[[], T],
    *,
    settings: Settings,
    log_event: str = "llm.rate_limit.retry",
) -> T:
    """Invoke *fn*, retrying on 429 with exponential / TPM-aware backoff."""
    max_retries = settings.llm_max_retries
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if not is_rate_limit_error(exc) or attempt >= max_retries:
                raise
            delay = _backoff_delay(exc, attempt, settings)
            logger.warning(
                log_event,
                attempt=attempt + 1,
                max_retries=max_retries,
                delay=round(delay, 2),
            )
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc
