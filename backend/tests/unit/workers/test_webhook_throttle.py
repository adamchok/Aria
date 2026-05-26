"""Webhook delivery throttle and 429 backoff helpers."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import MagicMock

import pytest

from app.workers.webhook_throttle import parse_retry_after, wait_for_webhook_slot


def test_parse_retry_after_seconds():
    headers = MagicMock()
    headers.get = lambda key: "45" if key.lower() == "retry-after" else None
    assert parse_retry_after(headers) == 45.0


def test_parse_retry_after_missing():
    assert parse_retry_after({}) is None


@pytest.mark.asyncio
async def test_wait_for_webhook_slot_spaces_requests():
    url = "https://webhook.site/test"
    t0 = time.monotonic()
    await wait_for_webhook_slot(url, 0.2)
    await wait_for_webhook_slot(url, 0.2)
    elapsed = time.monotonic() - t0
    assert elapsed >= 0.18
