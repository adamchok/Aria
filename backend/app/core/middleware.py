"""API key authentication middleware."""

from __future__ import annotations

import time
from datetime import datetime

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.database import session_scope
from app.core.logging import get_logger
from app.core.security import hash_key
from app.models.database import ApiKeyORM

logger = get_logger(__name__)

# Paths that bypass auth
_EXEMPT_PATHS = {
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
}


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Validate X-API-Key header, inject tenant_id into request.state."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip auth for exempt paths
        if request.url.path in _EXEMPT_PATHS:
            request.state.tenant_id = None
            request.state.is_admin = False
            return await call_next(request)

        settings = get_settings()
        raw_key = request.headers.get("X-API-Key", "").strip()

        if not raw_key:
            return _unauth("Missing X-API-Key header")

        # Admin key check (bypasses tenant lookup).
        # Admin can act on behalf of a tenant by passing X-Tenant-ID header.
        if settings.admin_api_key and raw_key == settings.admin_api_key:
            tenant_id_header = request.headers.get("X-Tenant-ID", "").strip()
            request.state.tenant_id = tenant_id_header or None
            request.state.is_admin = True
            return await call_next(request)

        # Tenant API key lookup
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

                # Touch last_used_at without blocking the request
                api_key.last_used_at = datetime.utcnow()
                await session.commit()

                request.state.tenant_id = api_key.tenant_id
                request.state.is_admin = False

        except Exception as exc:  # noqa: BLE001
            logger.exception("auth.middleware.error", error=str(exc))
            return _unauth("Authentication error")

        return await call_next(request)


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
        raise HTTPException(status_code=401, detail="Valid tenant API key required")
    return tenant_id


def require_admin(request: Request) -> None:
    """FastAPI dependency — raises 403 if not admin."""
    from fastapi import HTTPException
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin key required")
