"""Webhook registration and management endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.logging import get_logger
from app.core.middleware import require_tenant
from app.core.security import is_safe_webhook_url
from app.models.schemas import WebhookCreate, WebhookDeliveryResponse, WebhookResponse
from app.repositories.webhook_repository import WebhookRepository

router = APIRouter()
logger = get_logger(__name__)


@router.post("", response_model=WebhookResponse, status_code=201)
async def register_webhook(
    body: WebhookCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> WebhookResponse:
    if not is_safe_webhook_url(body.url):
        raise HTTPException(status_code=400, detail="Webhook URL targets a private/loopback address")

    repo = WebhookRepository(session)
    webhook, raw_secret = await repo.create(
        tenant_id, url=body.url, events=body.events, label=body.label
    )
    logger.info("webhook.created", tenant_id=tenant_id, url=body.url)
    return WebhookResponse(
        id=UUID(webhook.id),
        tenant_id=UUID(webhook.tenant_id),
        url=webhook.url,
        events=webhook.events,
        label=webhook.label,
        enabled=webhook.enabled,
        created_at=webhook.created_at,
        secret=raw_secret,
    )


@router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> list[WebhookResponse]:
    repo = WebhookRepository(session)
    hooks = await repo.list_for_tenant(tenant_id)
    return [
        WebhookResponse(
            id=UUID(w.id),
            tenant_id=UUID(w.tenant_id),
            url=w.url,
            events=w.events,
            label=w.label,
            enabled=w.enabled,
            created_at=w.created_at,
        )
        for w in hooks
    ]


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> None:
    repo = WebhookRepository(session)
    await repo.delete(webhook_id, tenant_id)


@router.post("/{webhook_id}/test", status_code=202)
async def test_webhook(
    webhook_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> dict:
    repo = WebhookRepository(session)
    await repo.get(webhook_id, tenant_id)
    from app.workers.tasks import deliver_webhook_task
    deliver_webhook_task.delay(str(webhook_id), None, "job.test")
    return {"status": "test_queued", "webhook_id": str(webhook_id)}


@router.post("/{webhook_id}/deliveries/{delivery_id}/resend", status_code=202)
async def resend_delivery(
    webhook_id: UUID,
    delivery_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> dict:
    from app.workers.tasks import deliver_webhook_task

    repo = WebhookRepository(session)
    delivery = await repo.get_delivery(delivery_id, webhook_id, tenant_id)
    if delivery is None:
        raise HTTPException(status_code=404, detail="Delivery not found")

    deliver_webhook_task.delay(str(webhook_id), delivery.job_id, delivery.event)
    logger.info("webhook.resend_queued", webhook_id=str(webhook_id), delivery_id=str(delivery_id))
    return {"status": "resend_queued", "webhook_id": str(webhook_id), "delivery_id": str(delivery_id)}


@router.get("/{webhook_id}/deliveries", response_model=list[WebhookDeliveryResponse])
async def list_deliveries(
    webhook_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> list[WebhookDeliveryResponse]:
    repo = WebhookRepository(session)
    deliveries = await repo.list_deliveries(webhook_id, tenant_id)
    return [
        WebhookDeliveryResponse(
            id=UUID(d.id),
            webhook_id=UUID(d.webhook_id),
            job_id=UUID(d.job_id) if d.job_id else None,
            event=d.event,
            status=d.status,
            attempt_count=d.attempt_count,
            last_attempt_at=d.last_attempt_at,
            response_code=d.response_code,
            response_body=d.response_body,
            created_at=d.created_at,
        )
        for d in deliveries
    ]
