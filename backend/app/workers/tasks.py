"""Celery tasks: pipeline execution, auto-batching, webhook delivery."""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime
from uuid import UUID

import httpx

from app.core.config import get_settings
from app.core.logging import bind_job_id, get_logger
from app.core.security import sign_webhook_payload
from app.repositories.pipeline_runner import execute_job
from app.workers.celery_app import celery_app

logger = get_logger(__name__)


def _dispose_engine() -> None:
    """Synchronously dispose the async engine's connection pool.

    asyncpg connections are bound to the event loop they were created in.
    When asyncio.run() closes that loop, pooled connections become stale and
    cause 'NoneType has no attribute send' / 'Event loop is closed' errors in
    subsequent asyncio.run() calls within the same worker process.
    sync_engine.dispose() tears down the pool without requiring a running loop.
    """
    from app.core.database import get_engine
    get_engine().sync_engine.dispose()


# ─── Pipeline ────────────────────────────────────────────────────────────────

@celery_app.task(name="aria.run_pipeline", bind=True, max_retries=2, default_retry_delay=10)
def run_pipeline_task(self, job_id: str) -> None:  # pragma: no cover
    bind_job_id(job_id)
    try:
        asyncio.run(execute_job(UUID(job_id)))
    except Exception as exc:
        logger.exception("celery.pipeline.error", error=str(exc))
        raise self.retry(exc=exc)
    finally:
        _dispose_engine()


async def enqueue_job(job_id: str | UUID) -> None:
    """Dispatch a job to the worker, or run inline if Celery is unreachable."""
    job_id = str(job_id)
    settings = get_settings()
    bind_job_id(job_id)

    if os.getenv("CELERY_TASK_ALWAYS_EAGER") == "1" or settings.is_test:
        await execute_job(UUID(job_id))
        return

    try:
        run_pipeline_task.delay(job_id)
        logger.info("celery.enqueued", job_id=job_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("celery.unreachable.falling_back_inline", error=str(exc))
        await execute_job(UUID(job_id))


# ─── Auto-batching ───────────────────────────────────────────────────────────

@celery_app.task(name="aria.auto_batch_transactions")
def auto_batch_transactions() -> None:
    """Celery Beat: scan buffer, create jobs when thresholds met."""
    try:
        asyncio.run(_auto_batch_async())
    finally:
        _dispose_engine()


async def _resolve_batch_bank_account_id(session, tenant_id: str) -> str | None:
    """Pick a bank account with pending ledger entries for auto-batched jobs."""
    from app.repositories.bank_account_repository import BankAccountRepository

    account_repo = BankAccountRepository(session, tenant_id=tenant_id)
    accounts, _ = await account_repo.list(page=1, page_size=100)
    candidates: list[tuple[str, int]] = []
    for acc in accounts:
        stats = await account_repo.get_stats(acc.id)
        if stats["uncleared_count"] > 0:
            candidates.append((acc.id, stats["uncleared_count"]))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[1], reverse=True)
    if len(candidates) > 1:
        logger.info(
            "batch.bank_account_ambiguous",
            tenant_id=tenant_id,
            chosen_account_id=candidates[0][0],
            candidate_count=len(candidates),
        )
    return candidates[0][0]


async def _auto_batch_async() -> None:
    from app.core.database import session_scope
    from app.models.enums import JobStatus
    from app.repositories.ingest_repository import IngestRepository
    from app.repositories.job_repository import JobRepository

    settings = get_settings()

    async with session_scope() as session:
        ingest_repo = IngestRepository(session)
        tenant_ids = await ingest_repo.get_all_tenant_ids_with_buffer()

    for tenant_id in tenant_ids:
        async with session_scope() as session:
            ingest_repo = IngestRepository(session)
            buffered = await ingest_repo.get_buffered_by_tenant(tenant_id)

            if not buffered:
                continue

            oldest = min(tx.received_at for tx in buffered)
            age_minutes = (datetime.utcnow() - oldest).total_seconds() / 60
            over_count = len(buffered) >= settings.batch_size_threshold
            over_time = age_minutes >= settings.batch_time_window_minutes

            if not (over_count or over_time):
                continue

            logger.info(
                "batch.triggered",
                tenant_id=tenant_id,
                count=len(buffered),
                age_minutes=round(age_minutes, 1),
                trigger="count" if over_count else "time",
            )

            # Build storage keys from buffer payloads
            proof_keys = [
                tx.payload.get("storage_key", "")
                for tx in buffered
                if tx.payload.get("storage_key")
            ]
            base_currency = buffered[0].payload.get("base_currency", "MYR")
            bank_account_id = await _resolve_batch_bank_account_id(session, tenant_id)
            if bank_account_id is None:
                logger.warning(
                    "batch.skipped_no_ledger",
                    tenant_id=tenant_id,
                    count=len(buffered),
                    detail="No bank account with pending ledger entries — cannot match proofs.",
                )
                continue

            job_repo = JobRepository(session, tenant_id=tenant_id)
            job = await job_repo.create_job(
                base_currency=base_currency,
                payment_proof_keys=proof_keys,
                bank_statement_key=None,
                bank_account_id=bank_account_id,
                tenant_id=tenant_id,
            )

            record_ids = [tx.id for tx in buffered]
            await ingest_repo.mark_batched(record_ids, job.id)
            job_id_str = str(job.id)

        # Enqueue outside session scope
        run_pipeline_task.delay(job_id_str)
        logger.info("batch.job_enqueued", job_id=job_id_str, tenant_id=tenant_id)


@celery_app.task(name="aria.batch_tenant_transactions")
def batch_tenant_transactions(tenant_id: str) -> None:
    """Manual flush: immediately batch a single tenant's buffer."""
    try:
        asyncio.run(_batch_one_tenant(tenant_id))
    finally:
        _dispose_engine()


async def _batch_one_tenant(tenant_id: str) -> None:
    from app.core.database import session_scope
    from app.repositories.ingest_repository import IngestRepository
    from app.repositories.job_repository import JobRepository

    async with session_scope() as session:
        ingest_repo = IngestRepository(session)
        buffered = await ingest_repo.get_buffered_by_tenant(tenant_id)

        if not buffered:
            logger.info("batch.manual_flush.empty", tenant_id=tenant_id)
            return

        proof_keys = [
            tx.payload.get("storage_key", "")
            for tx in buffered
            if tx.payload.get("storage_key")
        ]
        base_currency = buffered[0].payload.get("base_currency", "MYR")
        bank_account_id = await _resolve_batch_bank_account_id(session, tenant_id)
        if bank_account_id is None:
            logger.warning(
                "batch.manual_flush.skipped_no_ledger",
                tenant_id=tenant_id,
                count=len(buffered),
            )
            return

        job_repo = JobRepository(session, tenant_id=tenant_id)
        job = await job_repo.create_job(
            base_currency=base_currency,
            payment_proof_keys=proof_keys,
            bank_statement_key=None,
            bank_account_id=bank_account_id,
            tenant_id=tenant_id,
        )
        await ingest_repo.mark_batched([tx.id for tx in buffered], job.id)
        job_id_str = str(job.id)

    run_pipeline_task.delay(job_id_str)
    logger.info("batch.manual_flush.enqueued", job_id=job_id_str, tenant_id=tenant_id)


# ─── Webhook delivery ────────────────────────────────────────────────────────

@celery_app.task(name="aria.deliver_webhook", bind=True, max_retries=3)
def deliver_webhook_task(self, webhook_id: str, job_id: str | None, event: str) -> None:
    try:
        asyncio.run(_deliver_webhook(self, webhook_id, job_id, event))
    finally:
        _dispose_engine()


async def _deliver_webhook(task, webhook_id: str, job_id: str | None, event: str) -> None:
    from app.core.database import session_scope
    from app.models.enums import WebhookDeliveryStatus
    from app.repositories.webhook_repository import WebhookRepository

    settings = get_settings()

    async with session_scope() as session:
        repo = WebhookRepository(session)

        # Get webhook — may not exist for test events
        from sqlalchemy import select
        from app.models.database import WebhookORM
        result = await session.execute(select(WebhookORM).where(WebhookORM.id == webhook_id))
        webhook = result.scalar_one_or_none()
        if webhook is None:
            logger.warning("webhook.not_found", webhook_id=webhook_id)
            return

        delivery = await repo.create_delivery(webhook_id, job_id, event)

    # Build payload
    payload: dict[str, str] = {
        "event": event,
        "api_version": "2026-05-24",
        "webhook_id": webhook_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    if job_id is not None:
        payload["job_id"] = job_id
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    signature = sign_webhook_payload(webhook.secret, timestamp, body)

    # Deliver with retries
    attempt = task.request.retries + 1
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                webhook.url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-ARIA-Signature": signature,
                    "X-ARIA-Timestamp": str(timestamp),
                    "User-Agent": "ARIA-Webhooks/2.0",
                },
            )

        response_code = response.status_code
        success = 200 <= response_code < 300
        new_status = WebhookDeliveryStatus.SUCCESS if success else WebhookDeliveryStatus.FAILED

        async with session_scope() as session:
            repo = WebhookRepository(session)
            await repo.update_delivery(
                delivery.id,
                status=new_status,
                attempt_count=attempt,
                response_code=response_code,
                response_body=response.text[:500],
            )

        if not success:
            backoff = settings.webhook_retry_backoff_base_seconds * (2 ** task.request.retries)
            raise task.retry(exc=Exception(f"HTTP {response_code}"), countdown=backoff)

        logger.info("webhook.delivered", webhook_id=webhook_id, job_id=job_id, webhook_event=event)

    except httpx.RequestError as exc:
        backoff = settings.webhook_retry_backoff_base_seconds * (2 ** task.request.retries)
        async with session_scope() as session:
            repo = WebhookRepository(session)
            await repo.update_delivery(
                delivery.id,
                status=WebhookDeliveryStatus.FAILED,
                attempt_count=attempt,
            )
        logger.warning("webhook.request_error", error=str(exc), webhook_id=webhook_id)
        raise task.retry(exc=exc, countdown=backoff)


async def trigger_webhooks(tenant_id: str, job_id: str, event: str) -> None:
    """Called from pipeline_runner at status transitions."""
    from app.core.database import session_scope
    from app.repositories.webhook_repository import WebhookRepository

    async with session_scope() as session:
        repo = WebhookRepository(session)
        webhooks = await repo.get_enabled_for_event(tenant_id, event)

    for webhook in webhooks:
        deliver_webhook_task.delay(webhook.id, job_id, event)
