"""Auth middleware — accepts JWT Bearer tokens or legacy X-API-Key."""

from __future__ import annotations

from datetime import datetime

import jwt
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.database import session_scope
from app.core.logging import get_logger
from app.core.security import hash_key
from app.models.database import ApiKeyORM

logger = get_logger(__name__)

# Paths that bypass auth entirely
_EXEMPT_PATHS = {
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/auth/login",
}


class AuthMiddleware(BaseHTTPMiddleware):
    """Accept Authorization: Bearer <jwt> OR X-API-Key. Populate request.state."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.url.path in _EXEMPT_PATHS:
            request.state.tenant_id = None
            request.state.is_admin = False
            request.state.user_id = None
            return await call_next(request)

        settings = get_settings()

        # ── JWT Bearer path ──────────────────────────────────────────────────
        auth_header = request.headers.get("Authorization", "").strip()
        token: str | None = None
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):]
        elif (
            request.query_params.get("access_token")
            and request.url.path.endswith("/stream")
        ):
            # EventSource cannot send Authorization headers — restrict to SSE
            # stream path only so tokens never appear in regular request logs.
            token = request.query_params.get("access_token", "").strip()

        if token:
            try:
                payload = jwt.decode(
                    token,
                    settings.jwt_secret_key,
                    algorithms=[settings.jwt_algorithm],
                )
            except jwt.PyJWTError:
                return _unauth("Invalid or expired token")

            role = payload.get("role", "")
            user_id = payload.get("sub")
            token_tenant_id: str | None = payload.get("tenant_id")

            request.state.user_id = user_id
            request.state.is_admin = role == "admin"

            if request.state.is_admin:
                override = request.headers.get("X-Tenant-ID", "").strip()
                request.state.tenant_id = override or None
            else:
                request.state.tenant_id = token_tenant_id

            return await call_next(request)

        # ── Legacy X-API-Key path (programmatic / backward-compat) ──────────
        raw_key = request.headers.get("X-API-Key", "").strip()

        if not raw_key:
            return _unauth("Provide Authorization: Bearer <token> or X-API-Key header")

        if settings.admin_api_key and raw_key == settings.admin_api_key:
            tenant_id_header = request.headers.get("X-Tenant-ID", "").strip()
            request.state.tenant_id = tenant_id_header or None
            request.state.is_admin = True
            request.state.user_id = None
            return await call_next(request)

        key_hash = hash_key(raw_key)
        try:
            async with session_scope() as session:
                from sqlalchemy import select
                result = await session.execute(
                    select(ApiKeyORM).where(
                        ApiKeyORM.key_hash == key_hash,
                        ApiKeyORM.enabled == True,  # noqa: E712
                    )
                )
                api_key = result.scalar_one_or_none()

                if api_key is None:
                    return _unauth("Invalid or revoked API key")

                if api_key.expires_at and api_key.expires_at < datetime.utcnow():
                    return _unauth("API key has expired")

                api_key.last_used_at = datetime.utcnow()
                await session.commit()

                request.state.tenant_id = api_key.tenant_id
                request.state.is_admin = False
                request.state.user_id = None

        except Exception as exc:  # noqa: BLE001
            logger.exception("auth.middleware.error", error=str(exc))
            return _unauth("Authentication error")

        return await call_next(request)


# Backward-compatible alias
APIKeyMiddleware = AuthMiddleware


def _unauth(detail: str) -> Response:
    import json
    return Response(
        content=json.dumps({"detail": detail}),
        status_code=401,
        media_type="application/json",
    )


def require_tenant(request: Request) -> str:
    """FastAPI dependency — returns tenant_id or raises 401."""
    from fastapi import HTTPException
    tenant_id: str | None = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Tenant context required (login or valid API key)")
    return tenant_id


def require_admin(request: Request) -> None:
    """FastAPI dependency — raises 403 if not admin."""
    from fastapi import HTTPException
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")


def require_tenant_user(request: Request) -> str:
    """Require JWT tenant_user with tenant_id (blocks platform admin without impersonation)."""
    from fastapi import HTTPException
    if getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Tenant user credentials required")
    tenant_id: str | None = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Tenant context required (login or valid API key)")
    return tenant_id
