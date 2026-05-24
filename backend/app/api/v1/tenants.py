"""Admin endpoints for tenant and API key management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.middleware import require_admin
from app.models.schemas import ApiKeyCreate, ApiKeyResponse, TenantCreate, TenantResponse
from app.repositories.tenant_repository import TenantRepository

router = APIRouter(dependencies=[Depends(require_admin)])


@router.post("", response_model=TenantResponse, status_code=201)
async def create_tenant(
    body: TenantCreate,
    session: AsyncSession = Depends(get_db_session),
) -> TenantResponse:
    repo = TenantRepository(session)
    tenant = await repo.create_tenant(body.name)
    return TenantResponse(id=UUID(tenant.id), name=tenant.name, created_at=tenant.created_at)


@router.get("", response_model=list[TenantResponse])
async def list_tenants(session: AsyncSession = Depends(get_db_session)) -> list[TenantResponse]:
    repo = TenantRepository(session)
    tenants = await repo.list_tenants()
    return [TenantResponse(id=UUID(t.id), name=t.name, created_at=t.created_at) for t in tenants]


@router.post("/{tenant_id}/keys", response_model=ApiKeyResponse, status_code=201)
async def create_api_key(
    tenant_id: UUID,
    body: ApiKeyCreate,
    session: AsyncSession = Depends(get_db_session),
) -> ApiKeyResponse:
    repo = TenantRepository(session)
    api_key, raw_key = await repo.create_api_key(
        tenant_id, label=body.label, expires_at=body.expires_at
    )
    return ApiKeyResponse(
        id=UUID(api_key.id),
        tenant_id=UUID(api_key.tenant_id),
        label=api_key.label,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        enabled=api_key.enabled,
        created_at=api_key.created_at,
        key=raw_key,
    )


@router.get("/{tenant_id}/keys", response_model=list[ApiKeyResponse])
async def list_api_keys(
    tenant_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> list[ApiKeyResponse]:
    repo = TenantRepository(session)
    keys = await repo.list_keys(tenant_id)
    return [
        ApiKeyResponse(
            id=UUID(k.id),
            tenant_id=UUID(k.tenant_id),
            label=k.label,
            last_used_at=k.last_used_at,
            expires_at=k.expires_at,
            enabled=k.enabled,
            created_at=k.created_at,
        )
        for k in keys
    ]


@router.delete("/{tenant_id}/keys/{key_id}", status_code=204)
async def revoke_api_key(
    tenant_id: UUID,
    key_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    repo = TenantRepository(session)
    await repo.revoke_key(tenant_id, key_id)
