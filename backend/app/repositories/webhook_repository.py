"""Persistence for webhooks and delivery records."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import WebhookNotFoundError
from app.core.security import generate_webhook_secret
from app.models.database import WebhookDeliveryORM, WebhookORM
from app.models.enums import WebhookDeliveryStatus


class WebhookRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(
        self,
        tenant_id: UUID | str,
        *,
        url: str,
        events: list[str],
        label: str = "",
    ) -> tuple[WebhookORM, str]:
        """Return (WebhookORM, raw_secret). raw_secret shown once."""
        raw_secret, secret_hash = generate_webhook_secret()
        webhook = WebhookORM(
            tenant_id=str(tenant_id),
            url=url,
            events=events,
            secret_hash=secret_hash,
            secret=raw_secret,
            label=label,
        )
        self._s.add(webhook)
        await self._s.commit()
        await self._s.refresh(webhook)
        return webhook, raw_secret

    async def get(self, webhook_id: UUID | str, tenant_id: UUID | str) -> WebhookORM:
        result = await self._s.execute(
            select(WebhookORM).where(
                WebhookORM.id == str(webhook_id),
                WebhookORM.tenant_id == str(tenant_id),
            )
        )
        webhook = result.scalar_one_or_none()
        if webhook is None:
            raise WebhookNotFoundError(f"Webhook {webhook_id} not found")
        return webhook

    async def list_for_tenant(self, tenant_id: UUID | str) -> list[WebhookORM]:
        result = await self._s.execute(
            select(WebhookORM)
            .where(WebhookORM.tenant_id == str(tenant_id))
            .order_by(WebhookORM.created_at)
        )
        return list(result.scalars().all())

    async def delete(self, webhook_id: UUID | str, tenant_id: UUID | str) -> None:
        webhook = await self.get(webhook_id, tenant_id)
        await self._s.delete(webhook)
        await self._s.commit()

    async def get_enabled_for_event(self, tenant_id: UUID | str, event: str) -> list[WebhookORM]:
        result = await self._s.execute(
            select(WebhookORM).where(
                WebhookORM.tenant_id == str(tenant_id),
                WebhookORM.enabled == True,  # noqa: E712
            )
        )
        return [w for w in result.scalars().all() if event in (w.events or [])]

    async def create_delivery(
        self, webhook_id: str, job_id: str, event: str
    ) -> WebhookDeliveryORM:
        delivery = WebhookDeliveryORM(
            webhook_id=webhook_id,
            job_id=job_id,
            event=event,
        )
        self._s.add(delivery)
        await self._s.commit()
        await self._s.refresh(delivery)
        return delivery

    async def update_delivery(
        self,
        delivery_id: str,
        *,
        status: WebhookDeliveryStatus,
        attempt_count: int,
        response_code: int | None = None,
        response_body: str | None = None,
    ) -> None:
        from sqlalchemy import update
        await self._s.execute(
            update(WebhookDeliveryORM)
            .where(WebhookDeliveryORM.id == delivery_id)
            .values(
                status=status,
                attempt_count=attempt_count,
                last_attempt_at=datetime.utcnow(),
                response_code=response_code,
                response_body=response_body,
            )
        )
        await self._s.commit()

    async def list_deliveries(
        self, webhook_id: UUID | str, tenant_id: UUID | str, *, limit: int = 50
    ) -> list[WebhookDeliveryORM]:
        await self.get(webhook_id, tenant_id)  # access check
        result = await self._s.execute(
            select(WebhookDeliveryORM)
            .where(WebhookDeliveryORM.webhook_id == str(webhook_id))
            .order_by(WebhookDeliveryORM.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
