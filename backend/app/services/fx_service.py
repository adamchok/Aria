"""FX rate retrieval with primary/fallback providers and in-memory caching.

Production would use Bloomberg/Refinitiv. The free providers used here
(ExchangeRate-API + Open Exchange Rates) supply historical daily rates which
is sufficient for SME-grade reconciliation.
"""

from __future__ import annotations

import time
from datetime import date
from decimal import Decimal
from typing import Any, Protocol

import httpx

from app.core.config import Settings, get_settings
from app.core.exceptions import FXRateUnavailableError
from app.core.logging import get_logger

logger = get_logger(__name__)

# Static fallback rates used when no API key is configured and tests run offline.
# Approximate mid-market rates for May 2026; cover the four supported corridors.
_FALLBACK_RATES_TO_MYR: dict[str, Decimal] = {
    "MYR": Decimal("1.0"),
    "USD": Decimal("4.230"),
    "EUR": Decimal("4.580"),
    "GBP": Decimal("5.330"),
    "SGD": Decimal("3.140"),
}


class FXProvider(Protocol):
    name: str

    async def get_rate(self, source: str, target: str, on_date: date) -> Decimal: ...


class ExchangeRateAPIProvider:
    name = "exchangerate-api"

    def __init__(self, api_key: str, client: httpx.AsyncClient) -> None:
        self._api_key = api_key
        self._client = client

    async def get_rate(self, source: str, target: str, on_date: date) -> Decimal:
        if not self._api_key:
            raise FXRateUnavailableError("ExchangeRate-API key not configured")
        url = (
            f"https://v6.exchangerate-api.com/v6/{self._api_key}/history/"
            f"{source}/{on_date.year}/{on_date.month}/{on_date.day}"
        )
        resp = await self._client.get(url, timeout=10.0)
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        if data.get("result") != "success":
            raise FXRateUnavailableError(
                f"ExchangeRate-API returned error: {data.get('error-type')}"
            )
        rates = data.get("conversion_rates", {})
        if target not in rates:
            raise FXRateUnavailableError(f"Target {target} not in response")
        return Decimal(str(rates[target]))


class OpenExchangeRatesProvider:
    name = "openexchangerates"

    def __init__(self, app_id: str, client: httpx.AsyncClient) -> None:
        self._app_id = app_id
        self._client = client

    async def get_rate(self, source: str, target: str, on_date: date) -> Decimal:
        if not self._app_id:
            raise FXRateUnavailableError("OpenExchangeRates app_id not configured")
        url = f"https://openexchangerates.org/api/historical/{on_date.isoformat()}.json"
        params = {"app_id": self._app_id, "base": source, "symbols": target}
        resp = await self._client.get(url, params=params, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates", {})
        if target not in rates:
            raise FXRateUnavailableError(f"Target {target} not in response")
        return Decimal(str(rates[target]))


class StaticFallbackProvider:
    """Last-resort provider for offline/demo environments."""

    name = "static-fallback"

    async def get_rate(self, source: str, target: str, on_date: date) -> Decimal:
        if source not in _FALLBACK_RATES_TO_MYR or target not in _FALLBACK_RATES_TO_MYR:
            raise FXRateUnavailableError(f"No fallback rate for {source}->{target}")
        # Cross via MYR: source->MYR / target->MYR
        return _FALLBACK_RATES_TO_MYR[source] / _FALLBACK_RATES_TO_MYR[target]


class FXService:
    """FX retrieval with provider chain, Redis cache, and in-memory TTL cache."""

    def __init__(
        self,
        providers: list[FXProvider] | None = None,
        settings: Settings | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._cache: dict[tuple[str, str, str], tuple[Decimal, float]] = {}
        self._redis = None
        if providers is None:
            # Redis cache only on the default provider chain; tests pass explicit providers.
            try:
                import redis.asyncio as aioredis  # type: ignore[import]
                self._redis = aioredis.from_url(self._settings.redis_url, decode_responses=False)
            except Exception:
                pass
            client = http_client or httpx.AsyncClient()
            providers = []
            # Prefer Open Exchange Rates — ExchangeRate-API free tier lacks historical endpoints.
            if self._settings.openexchangerates_app_id:
                providers.append(
                    OpenExchangeRatesProvider(self._settings.openexchangerates_app_id, client),
                )
            if self._settings.exchangerate_api_key:
                providers.append(
                    ExchangeRateAPIProvider(self._settings.exchangerate_api_key, client),
                )
            providers.append(StaticFallbackProvider())
        self._providers = providers

    async def get_rate(self, source: str, target: str, on_date: date) -> Decimal:
        source = source.upper()
        target = target.upper()
        if source == target:
            return Decimal("1")

        cache_key = (source, target, on_date.isoformat())
        redis_key = f"aria:fx:{source}:{target}:{on_date.isoformat()}"

        # Redis cache layer
        if self._redis:
            try:
                cached_bytes = await self._redis.get(redis_key)
                if cached_bytes:
                    return Decimal(cached_bytes.decode())
            except Exception:
                pass

        # In-memory cache
        cached = self._cache.get(cache_key)
        if cached:
            rate, expires_at = cached
            if expires_at > time.time():
                return rate

        last_error: Exception | None = None
        for provider in self._providers:
            try:
                rate = await provider.get_rate(source, target, on_date)
                ttl = self._settings.fx_cache_ttl_seconds
                if self._redis:
                    try:
                        await self._redis.setex(redis_key, ttl, str(rate))
                    except Exception:
                        pass
                self._cache[cache_key] = (rate, time.time() + ttl)
                logger.info(
                    "fx.rate.retrieved",
                    source=source,
                    target=target,
                    date=on_date.isoformat(),
                    provider=provider.name,
                    rate=str(rate),
                )
                return rate
            except FXRateUnavailableError as exc:
                last_error = exc
                logger.debug("fx.provider.skip", provider=provider.name, reason=str(exc))
            except Exception as exc:  # network, parse — fall through to next provider
                last_error = exc
                logger.warning("fx.provider.error", provider=provider.name, error=str(exc))

        raise FXRateUnavailableError(
            f"All FX providers failed for {source}->{target} on {on_date}: {last_error}"
        )

    def clear_cache(self) -> None:
        self._cache.clear()
