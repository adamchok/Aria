"""FX service tests — cache, fallback, error semantics."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.core.exceptions import FXRateUnavailableError
from app.services.fx_service import FXService, StaticFallbackProvider


class _CountingProvider:
    name = "counting"

    def __init__(self, rate: Decimal) -> None:
        self._rate = rate
        self.calls = 0

    async def get_rate(self, source, target, on_date):
        self.calls += 1
        return self._rate


class _FailingProvider:
    name = "failing"

    async def get_rate(self, source, target, on_date):
        raise FXRateUnavailableError("nope")


@pytest.mark.asyncio
async def test_same_currency_returns_one():
    svc = FXService(providers=[StaticFallbackProvider()])
    assert await svc.get_rate("USD", "USD", date(2026, 5, 1)) == Decimal("1")


@pytest.mark.asyncio
async def test_static_fallback_usd_myr():
    svc = FXService(providers=[StaticFallbackProvider()])
    rate = await svc.get_rate("USD", "MYR", date(2026, 5, 18))
    assert rate > Decimal("3") and rate < Decimal("6")


@pytest.mark.asyncio
async def test_provider_chain_falls_through():
    counting = _CountingProvider(Decimal("4.2"))
    svc = FXService(providers=[_FailingProvider(), counting])
    rate = await svc.get_rate("USD", "MYR", date(2026, 5, 1))
    assert rate == Decimal("4.2")
    assert counting.calls == 1


@pytest.mark.asyncio
async def test_cache_avoids_second_call():
    counting = _CountingProvider(Decimal("4.2"))
    svc = FXService(providers=[counting])
    d = date(2026, 5, 1)
    await svc.get_rate("USD", "MYR", d)
    await svc.get_rate("USD", "MYR", d)
    assert counting.calls == 1


@pytest.mark.asyncio
async def test_all_failures_raise():
    svc = FXService(providers=[_FailingProvider(), _FailingProvider()])
    with pytest.raises(FXRateUnavailableError):
        await svc.get_rate("USD", "MYR", date(2026, 5, 1))
