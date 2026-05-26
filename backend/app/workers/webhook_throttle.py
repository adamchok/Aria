"""Per-URL spacing for outbound webhook HTTP calls (avoids receiver 429s)."""

from __future__ import annotations

import asyncio
import time

_url_locks: dict[str, asyncio.Lock] = {}
_last_sent_monotonic: dict[str, float] = {}
_registry_lock = asyncio.Lock()


async def wait_for_webhook_slot(url: str, min_interval_seconds: float) -> None:
    """Ensure at least *min_interval_seconds* between POSTs to the same URL."""
    if min_interval_seconds <= 0:
        return

    async with _registry_lock:
        if url not in _url_locks:
            _url_locks[url] = asyncio.Lock()
        url_lock = _url_locks[url]

    async with url_lock:
        now = time.monotonic()
        last = _last_sent_monotonic.get(url, 0.0)
        delay = min_interval_seconds - (now - last)
        if delay > 0:
            await asyncio.sleep(delay)
        _last_sent_monotonic[url] = time.monotonic()


def parse_retry_after(headers: object) -> float | None:
    """Parse Retry-After header (seconds) when present."""
    get = getattr(headers, "get", None)
    if not callable(get):
        return None
    raw = get("retry-after") or get("Retry-After")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None
