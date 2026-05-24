"""Transaction ingestion and buffer status endpoints."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db_session
from app.core.logging import get_logger
from app.core.middleware import require_tenant
from app.models.schemas import (
    QueueCorridorStatus,
    QueueStatusResponse,
    TransactionIngestRequest,
    TransactionIngestResponse,
)
from app.repositories.ingest_repository import IngestRepository
from app.repositories.job_repository import JobRepository
from app.services.storage import StorageService
from app.workers.tasks import enqueue_job

router = APIRouter()
logger = get_logger(__name__)


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
            import base64
            try:
                raw = base64.b64decode(tx.payment_proof_b64)
            except Exception as exc:
                from fastapi import HTTPException
                raise HTTPException(
                    status_code=422,
                    detail=f"Invalid base64 in payment_proof_b64 for corridor {tx.corridor}",
                ) from exc
            key = storage.put_object(raw, f"proof_{tx.corridor}.bin", content_type="application/octet-stream", tenant_id=tenant_id)
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

    total_buffered = sum(r["count"] for r in summary)
    oldest: datetime | None = None
    if summary:
        oldest_candidates = [r["oldest"] for r in summary if r["oldest"]]
        oldest = min(oldest_candidates) if oldest_candidates else None

    trigger = "none"
    if total_buffered > 0 and oldest:
        over_count = total_buffered >= settings.batch_size_threshold
        age_minutes = (datetime.utcnow() - oldest).total_seconds() / 60
        over_time = age_minutes >= settings.batch_time_window_minutes
        if over_count and over_time:
            trigger = "both"
        elif over_count:
            trigger = "count"
        elif over_time:
            trigger = "time"

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
