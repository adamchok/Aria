"""Persistence for tenants and API keys."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import TenantNotFoundError
from app.core.security import generate_api_key, hash_key
from app.models.database import ApiKeyORM, TenantORM


class TenantRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create_tenant(self, name: str) -> TenantORM:
        tenant = TenantORM(name=name)
        self._s.add(tenant)
        await self._s.commit()
        await self._s.refresh(tenant)
        return tenant

    async def get(self, tenant_id: UUID | str) -> TenantORM:
        result = await self._s.execute(select(TenantORM).where(TenantORM.id == str(tenant_id)))
        tenant = result.scalar_one_or_none()
        if tenant is None:
            raise TenantNotFoundError(f"Tenant {tenant_id} not found")
        return tenant

    async def list_tenants(self) -> list[TenantORM]:
        result = await self._s.execute(select(TenantORM).order_by(TenantORM.created_at))
        return list(result.scalars().all())

    async def create_api_key(
        self,
        tenant_id: UUID | str,
        *,
        label: str = "",
        expires_at: datetime | None = None,
    ) -> tuple[ApiKeyORM, str]:
        """Return (ApiKeyORM, raw_key). raw_key shown once, never stored."""
        await self.get(tenant_id)  # raises if not found
        raw_key, key_hash = generate_api_key()
        api_key = ApiKeyORM(
            tenant_id=str(tenant_id),
            key_hash=key_hash,
            label=label,
            expires_at=expires_at,
        )
        self._s.add(api_key)
        await self._s.commit()
        await self._s.refresh(api_key)
        return api_key, raw_key

    async def list_keys(self, tenant_id: UUID | str) -> list[ApiKeyORM]:
        result = await self._s.execute(
            select(ApiKeyORM)
            .where(ApiKeyORM.tenant_id == str(tenant_id))
            .order_by(ApiKeyORM.created_at)
        )
        return list(result.scalars().all())

    async def revoke_key(self, tenant_id: UUID | str, key_id: UUID | str) -> ApiKeyORM:
        result = await self._s.execute(
            select(ApiKeyORM).where(
                ApiKeyORM.id == str(key_id),
                ApiKeyORM.tenant_id == str(tenant_id),
            )
        )
        api_key = result.scalar_one_or_none()
        if api_key is None:
            from app.core.exceptions import MatchNotFoundError
            raise MatchNotFoundError(f"API key {key_id} not found for tenant {tenant_id}")
        api_key.enabled = False
        await self._s.commit()
        await self._s.refresh(api_key)
        return api_key
