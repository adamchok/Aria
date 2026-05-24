"""User management endpoints — admin only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.middleware import require_admin
from app.core.security import hash_password
from app.models.database import UserORM
from app.models.enums import UserRole
from app.models.schemas import UserCreate, UserResponse

router = APIRouter()


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    session: AsyncSession = Depends(get_db_session),
    _: None = Depends(require_admin),
) -> UserResponse:
    email = body.email.lower().strip()

    existing = await session.execute(select(UserORM).where(UserORM.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    if body.role == UserRole.TENANT_USER and body.tenant_id is None:
        raise HTTPException(status_code=422, detail="tenant_id required for tenant_user role")

    user = UserORM(
        email=email,
        hashed_password=hash_password(body.password),
        role=body.role,
        tenant_id=str(body.tenant_id) if body.tenant_id else None,
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


@router.get("", response_model=list[UserResponse])
async def list_users(
    tenant_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_db_session),
    _: None = Depends(require_admin),
) -> list[UserResponse]:
    stmt = select(UserORM)
    if tenant_id:
        stmt = stmt.where(UserORM.tenant_id == tenant_id)
    stmt = stmt.order_by(UserORM.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(stmt)
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


@router.delete("/{user_id}", status_code=204)
async def deactivate_user(
    user_id: str,
    session: AsyncSession = Depends(get_db_session),
    _: None = Depends(require_admin),
) -> None:
    result = await session.execute(select(UserORM).where(UserORM.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    await session.commit()
