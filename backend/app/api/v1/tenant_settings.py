"""Tenant-scoped settings — API keys and users for the mgmt app."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.middleware import require_tenant_user
from app.core.security import hash_password
from app.models.database import UserORM
from app.models.enums import UserRole
from app.models.schemas import ApiKeyCreate, ApiKeyResponse, TenantUserCreate, UserResponse
from app.repositories.tenant_repository import TenantRepository

router = APIRouter()


@router.get("/keys", response_model=list[ApiKeyResponse])
async def list_tenant_keys(
    tenant_id: str = Depends(require_tenant_user),
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


@router.post("/keys", response_model=ApiKeyResponse, status_code=201)
async def create_tenant_key(
    body: ApiKeyCreate,
    tenant_id: str = Depends(require_tenant_user),
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


@router.delete("/keys/{key_id}", status_code=204)
async def revoke_tenant_key(
    key_id: UUID,
    tenant_id: str = Depends(require_tenant_user),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    repo = TenantRepository(session)
    await repo.revoke_key(tenant_id, key_id)


@router.get("/users", response_model=list[UserResponse])
async def list_tenant_users(
    tenant_id: str = Depends(require_tenant_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[UserResponse]:
    result = await session.execute(
        select(UserORM)
        .where(UserORM.tenant_id == tenant_id)
        .order_by(UserORM.created_at.desc())
    )
    users = result.scalars().all()
    return [
        UserResponse(
            id=u.id,  # type: ignore[arg-type]
            email=u.email,
            role=u.role,
            tenant_id=u.tenant_id,  # type: ignore[arg-type]
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_tenant_user(
    body: TenantUserCreate,
    tenant_id: str = Depends(require_tenant_user),
    session: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    email = body.email.lower().strip()

    existing = await session.execute(select(UserORM).where(UserORM.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = UserORM(
        email=email,
        hashed_password=hash_password(body.password),
        role=UserRole.TENANT_USER,
        tenant_id=tenant_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return UserResponse(
        id=user.id,  # type: ignore[arg-type]
        email=user.email,
        role=user.role,
        tenant_id=user.tenant_id,  # type: ignore[arg-type]
        is_active=user.is_active,
        created_at=user.created_at,
    )
