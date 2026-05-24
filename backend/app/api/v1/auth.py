"""Authentication endpoints — login and current user."""

from __future__ import annotations

from datetime import datetime

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db_session
from app.core.security import create_access_token, verify_password
from app.models.database import UserORM
from app.models.schemas import LoginRequest, LoginResponse, UserResponse

router = APIRouter()

# Pre-computed once at process startup for constant-time login on missing users.
# bcrypt.checkpw reads the cost from the hash, so any valid hash prevents timing leaks.
_DUMMY_HASH: str = _bcrypt.hashpw(b"aria-dummy-timing-defense", _bcrypt.gensalt(12)).decode()


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    session: AsyncSession = Depends(get_db_session),
) -> LoginResponse:
    settings = get_settings()

    result = await session.execute(
        select(UserORM).where(UserORM.email == body.email.lower().strip())
    )
    user = result.scalar_one_or_none()

    # Always run bcrypt to prevent user-enumeration via timing.
    password_ok = verify_password(body.password, user.hashed_password if user else _DUMMY_HASH)

    if not password_ok or user is None or not user.is_active:
        # Single 401 for all failure modes — no information about whether the
        # email exists or the account is active.
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user.last_login_at = datetime.utcnow()
    await session.commit()

    token = create_access_token(
        user_id=user.id,
        role=user.role.value,
        tenant_id=user.tenant_id,
        secret=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        expires_minutes=settings.jwt_access_token_expire_minutes,
    )

    return LoginResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,  # type: ignore[arg-type]
            email=user.email,
            role=user.role,
            tenant_id=user.tenant_id,  # type: ignore[arg-type]
            is_active=user.is_active,
            created_at=user.created_at,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> UserResponse:
    # Middleware already verified the token and set request.state.user_id.
    user_id: str | None = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Bearer token required")

    result = await session.execute(select(UserORM).where(UserORM.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")

    return UserResponse(
        id=user.id,  # type: ignore[arg-type]
        email=user.email,
        role=user.role,
        tenant_id=user.tenant_id,  # type: ignore[arg-type]
        is_active=user.is_active,
        created_at=user.created_at,
    )
