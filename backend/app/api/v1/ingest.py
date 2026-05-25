"""Transaction ingestion and buffer status endpoints."""

from __future__ import annotations

import base64
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db_session
from app.core.logging import get_logger
from app.core.middleware import require_admin, require_tenant
from app.models.schemas import (
    AdminQueueStatusResponse,
    AdminQueueTenantStatus,
    QueueCorridorStatus,
    QueueStatusResponse,
    TransactionIngestRequest,
    TransactionIngestResponse,
)
from app.repositories.ingest_repository import IngestRepository
from app.repositories.job_repository import JobRepository
from app.repositories.tenant_repository import TenantRepository
from app.services.storage import StorageService
from app.workers.tasks import enqueue_job


def _proof_filename_and_type(raw: bytes) -> tuple[str, str]:
    """Return (filename, content_type) for a proof file using magic-byte detection.

    Filename is format-extension only — corridor name is intentionally excluded
    to avoid path-separator collisions (e.g. 'USD/MYR' containing a literal '/').
    The storage key UUID prefix already ensures uniqueness. The actual payment
    currency is auto-detected by the LLM ingestion stage from the document
    content, not derived from the corridor label.
    """
    if raw[:3] == b"\xff\xd8\xff":
        return "proof.jpg", "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "proof.png", "image/png"
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "proof.webp", "image/webp"
    if raw[:4] == b"%PDF":
        return "proof.pdf", "application/pdf"
    if raw[:4] == b"PK\x03\x04":
        return "proof.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    # Unknown binary — default to JPEG so Anthropic vision gets a usable media_type
    return "proof.jpg", "image/jpeg"

router = APIRouter()
logger = get_logger(__name__)


def _compute_batch_trigger(
    summary: list[dict],
    *,
    batch_size_threshold: int,
    batch_time_window_minutes: int,
) -> tuple[int, datetime | None, str]:
    total_buffered = sum(r["count"] for r in summary)
    oldest: datetime | None = None
    if summary:
        oldest_candidates = [r["oldest"] for r in summary if r["oldest"]]
        oldest = min(oldest_candidates) if oldest_candidates else None

    trigger = "none"
    if total_buffered > 0 and oldest:
        over_count = total_buffered >= batch_size_threshold
        age_minutes = (datetime.utcnow() - oldest).total_seconds() / 60
        over_time = age_minutes >= batch_time_window_minutes
        if over_count and over_time:
            trigger = "both"
        elif over_count:
            trigger = "count"
        elif over_time:
            trigger = "time"

    return total_buffered, oldest, trigger


@router.post("/transactions", response_model=TransactionIngestResponse, status_code=202)
async def ingest_transactions(
    body: TransactionIngestRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> TransactionIngestResponse:
    """Push transactions into the buffer. Auto-batching fires via Celery Beat."""
    storage = StorageService()
    storage.ensure_bucket()

    items: list[dict] = []
    for tx in body.transactions:
        item = tx.model_dump(mode="json")

        # Store base64 proof content in object storage
        if tx.payment_proof_b64:
            try:
                raw = base64.b64decode(tx.payment_proof_b64)
            except Exception as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid base64 in payment_proof_b64 for corridor {tx.corridor}",
                ) from exc
            filename, content_type = _proof_filename_and_type(raw)
            key = storage.put_object(raw, filename, content_type=content_type)
            item["storage_key"] = key
            item.pop("payment_proof_b64", None)

        items.append(item)

    repo = IngestRepository(session)
    await repo.buffer_transactions(tenant_id, items)

    logger.info("ingest.buffered", tenant_id=tenant_id, count=len(items))
    return TransactionIngestResponse(buffered=len(items), tenant_id=UUID(tenant_id))


@router.get("/queue", response_model=QueueStatusResponse)
async def get_queue_status(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> QueueStatusResponse:
    settings = get_settings()
    repo = IngestRepository(session)
    summary = await repo.get_queue_summary(tenant_id)

    total_buffered, _oldest, trigger = _compute_batch_trigger(
        summary,
        batch_size_threshold=settings.batch_size_threshold,
        batch_time_window_minutes=settings.batch_time_window_minutes,
    )

    return QueueStatusResponse(
        tenant_id=UUID(tenant_id),
        total_buffered=total_buffered,
        by_corridor=[
            QueueCorridorStatus(
                corridor=r["corridor"],
                buffered_count=r["count"],
                oldest_received_at=r["oldest"],
            )
            for r in summary
        ],
        next_batch_trigger=trigger,
    )


@router.post("/queue/flush", status_code=202)
async def flush_queue(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> dict:
    """Manually trigger batching for this tenant's buffered transactions."""
    from app.workers.tasks import batch_tenant_transactions
    batch_tenant_transactions.delay(tenant_id)
    logger.info("ingest.manual_flush", tenant_id=tenant_id)
    return {"status": "flush_queued", "tenant_id": tenant_id}


@router.get("/admin/queue", response_model=AdminQueueStatusResponse)
async def admin_queue_status(
    session: AsyncSession = Depends(get_db_session),
    _: None = Depends(require_admin),
) -> AdminQueueStatusResponse:
    settings = get_settings()
    tenant_repo = TenantRepository(session)
    ingest_repo = IngestRepository(session)
    tenants = await tenant_repo.list_tenants()

    tenant_statuses: list[AdminQueueTenantStatus] = []
    total_system = 0

    # N+1: one query per tenant — acceptable for demo scale.
    for tenant in tenants:
        summary = await ingest_repo.get_queue_summary(tenant.id)
        total_buffered, _oldest, trigger = _compute_batch_trigger(
            summary,
            batch_size_threshold=settings.batch_size_threshold,
            batch_time_window_minutes=settings.batch_time_window_minutes,
        )
        total_system += total_buffered
        tenant_statuses.append(
            AdminQueueTenantStatus(
                tenant_id=UUID(tenant.id),
                tenant_name=tenant.name,
                total_buffered=total_buffered,
                by_corridor=[
                    QueueCorridorStatus(
                        corridor=r["corridor"],
                        buffered_count=r["count"],
                        oldest_received_at=r["oldest"],
                    )
                    for r in summary
                ],
                next_batch_trigger=trigger,
            )
        )

    return AdminQueueStatusResponse(
        tenants=tenant_statuses,
        total_buffered_system=total_system,
    )


@router.post("/admin/queue/flush/{tenant_id}", status_code=202)
async def admin_flush_queue(
    tenant_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    _: None = Depends(require_admin),
) -> dict:
    tenant_repo = TenantRepository(session)
    await tenant_repo.get(tenant_id)

    from app.workers.tasks import batch_tenant_transactions

    batch_tenant_transactions.delay(str(tenant_id))
    logger.info("ingest.admin_flush", tenant_id=str(tenant_id))
    return {"status": "flush_queued", "tenant_id": str(tenant_id)}
