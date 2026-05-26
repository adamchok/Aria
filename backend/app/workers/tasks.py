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
from app.core.security import resolve_webhook_signing_secret, sign_webhook_payload
from app.repositories.pipeline_runner import execute_job
from app.workers.celery_app import celery_app
from app.workers.webhook_throttle import parse_retry_after, wait_for_webhook_slot

logger = get_logger(__name__)


def _dispose_engine() -> None:
    """Drop stale asyncpg connections from the pool after asyncio.run() closes its loop.

    close=False removes pool references without calling the async close() method —
    avoids MissingGreenlet errors from SQLAlchemy trying to await inside a sync context.
    The server-side connections are recycled when the OS reclaims the sockets.
    """
    from app.core.database import get_engine
    get_engine().sync_engine.dispose(close=False)


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


def _corridor_group_key(tx) -> str:
    """Group buffered ingest rows by corridor label (e.g. USD/MYR)."""
    corridor = (getattr(tx, "corridor", None) or tx.payload.get("corridor") or "MYR").upper()
    return corridor


def _base_currency_from_corridor(corridor_key: str) -> str:
    """Derive reconciliation base currency from a corridor label."""
    if "/" in corridor_key:
        return corridor_key.split("/")[-1]
    if corridor_key in {"UNKNOWN", "MYR"}:
        return "MYR"
    return corridor_key if len(corridor_key) == 3 else "MYR"


async def _create_batch_jobs(
    session,
    *,
    tenant_id: str,
    buffered: list,
    bank_account_id: str,
    batch_size_threshold: int,
    base_currency_filter: str | None = None,
) -> list[str]:
    """Create one job per corridor group; mark only included txs as batched."""
    from collections import defaultdict

    from app.repositories.ingest_repository import IngestRepository
    from app.repositories.job_repository import JobRepository

    corridor_groups: dict[str, list] = defaultdict(list)
    for tx in buffered:
        corridor_groups[_corridor_group_key(tx)].append(tx)

    ingest_repo = IngestRepository(session)
    job_repo = JobRepository(session, tenant_id=tenant_id)
    created_job_ids: list[str] = []

    for corridor_key, corridor_txs in corridor_groups.items():
        base_currency = _base_currency_from_corridor(corridor_key)
        if base_currency_filter and base_currency != base_currency_filter.upper():
            continue
        batched_txs = [
            tx for tx in corridor_txs if tx.payload.get("storage_key")
        ][:batch_size_threshold]
        proof_keys = [tx.payload["storage_key"] for tx in batched_txs]
        if not proof_keys:
            continue
        job = await job_repo.create_job(
            base_currency=base_currency,
            payment_proof_keys=proof_keys,
            bank_statement_key=None,
            bank_account_id=bank_account_id,
            tenant_id=tenant_id,
        )
        await ingest_repo.mark_batched([tx.id for tx in batched_txs], job.id)
        created_job_ids.append(str(job.id))

    return created_job_ids


async def _auto_batch_async() -> None:
    from app.core.database import session_scope
    from app.repositories.ingest_repository import IngestRepository

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

            bank_account_id = await _resolve_batch_bank_account_id(session, tenant_id)
            if bank_account_id is None:
                logger.warning(
                    "batch.skipped_no_ledger",
                    tenant_id=tenant_id,
                    count=len(buffered),
                    detail="No bank account with pending ledger entries — cannot match proofs.",
                )
                continue

            created_job_ids = await _create_batch_jobs(
                session,
                tenant_id=tenant_id,
                buffered=buffered,
                bank_account_id=bank_account_id,
                batch_size_threshold=settings.batch_size_threshold,
            )

        # Enqueue outside session scope
        for job_id_str in created_job_ids:
            run_pipeline_task.delay(job_id_str)
            logger.info("batch.job_enqueued", job_id=job_id_str, tenant_id=tenant_id)


@celery_app.task(name="aria.batch_tenant_transactions")
def batch_tenant_transactions(
    tenant_id: str,
    bank_account_id: str | None = None,
    base_currency: str | None = None,
) -> None:
    """Manual flush: immediately batch a single tenant's buffer."""
    try:
        asyncio.run(_batch_one_tenant(tenant_id, bank_account_id, base_currency))
    finally:
        _dispose_engine()


async def _batch_one_tenant(
    tenant_id: str,
    bank_account_id: str | None = None,
    base_currency: str | None = None,
) -> None:
    from app.core.database import session_scope
    from app.repositories.ingest_repository import IngestRepository

    settings = get_settings()

    async with session_scope() as session:
        ingest_repo = IngestRepository(session)
        buffered = await ingest_repo.get_buffered_by_tenant(tenant_id)

        if not buffered:
            logger.info("batch.manual_flush.empty", tenant_id=tenant_id)
            return

        resolved_account = bank_account_id or await _resolve_batch_bank_account_id(
            session, tenant_id
        )
        if resolved_account is None:
            logger.warning(
                "batch.manual_flush.skipped_no_ledger",
                tenant_id=tenant_id,
                count=len(buffered),
            )
            return

        created_job_ids = await _create_batch_jobs(
            session,
            tenant_id=tenant_id,
            buffered=buffered,
            bank_account_id=resolved_account,
            batch_size_threshold=settings.batch_size_threshold,
            base_currency_filter=base_currency,
        )

    for job_id_str in created_job_ids:
        run_pipeline_task.delay(job_id_str)
        logger.info("batch.manual_flush.enqueued", job_id=job_id_str, tenant_id=tenant_id)


# ─── Webhook delivery ────────────────────────────────────────────────────────

@celery_app.task(name="aria.deliver_webhook", bind=True, max_retries=5)
def deliver_webhook_task(self, webhook_id: str, job_id: str | None, event: str, stage: str | None = None) -> None:
    try:
        asyncio.run(_deliver_webhook(self, webhook_id, job_id, event, stage=stage))
    finally:
        _dispose_engine()


async def _deliver_webhook(task, webhook_id: str, job_id: str | None, event: str, *, stage: str | None = None) -> None:
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

    # Fetch job details for enriched payload
    job_data: dict = {}
    if job_id is not None:
        async with session_scope() as session:
            from sqlalchemy import select
            from app.models.database import JobORM
            result = await session.execute(select(JobORM).where(JobORM.id == job_id))
            job = result.scalar_one_or_none()
            if job is not None:
                job_data["tenant_id"] = job.tenant_id
                job_data["status"] = job.status
                job_data["base_currency"] = job.base_currency
                job_data["progress_pct"] = job.progress_pct
                job_data["job_created_at"] = job.created_at.isoformat() + "Z"
                job_data["job_updated_at"] = job.updated_at.isoformat() + "Z"
                if event == "job.failed" and job.error:
                    job_data["error"] = job.error
                if event == "job.stage_completed" and stage:
                    job_data["stage"] = stage
                summary = (job.report_blob or {}).get("summary", {})
                if summary:
                    job_data["record_count"] = summary.get("total_records", 0)
                    job_data["matched_count"] = summary.get("matched_count", 0)
                    job_data["uncertain_count"] = summary.get("uncertain_count", 0)
                    job_data["unmatched_count"] = summary.get("unmatched_count", 0)
                    job_data["total_value_myr"] = summary.get("total_value_myr", "0")
                    job_data["matched_value_myr"] = summary.get("matched_value_myr", "0")
                    job_data["total_variance_myr"] = summary.get("total_variance_myr", "0")
                    job_data["processing_seconds"] = summary.get("processing_seconds", 0)

    # Build payload
    payload: dict = {
        "event": event,
        "api_version": "2026-05-24",
        "webhook_id": webhook_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    if job_id is not None:
        payload["job_id"] = job_id
    if job_data:
        payload["data"] = job_data
    elif event == "job.test":
        payload["data"] = {"message": "Test event from ARIA webhook system"}
    body = json.dumps(payload).encode()
    timestamp = int(time.time())
    settings = get_settings()
    try:
        signing_secret = resolve_webhook_signing_secret(
            webhook.secret,
            encryption_key=settings.webhook_secret_encryption_key,
            fallback_secret=settings.jwt_secret_key,
        )
    except ValueError:
        logger.error(
            "webhook.secret_decrypt_failed",
            webhook_id=webhook_id,
            hint="WEBHOOK_SECRET_ENCRYPTION_KEY or JWT_SECRET_KEY changed after webhook was created. "
                 "Delete and recreate the webhook to fix.",
        )
        async with session_scope() as session:
            repo = WebhookRepository(session)
            await repo.update_delivery(
                delivery.id,
                status=WebhookDeliveryStatus.FAILED,
                attempt_count=task.request.retries + 1,
                response_body="Unable to decrypt webhook secret — key mismatch",
            )
        return  # permanent failure, no retry
    signature = sign_webhook_payload(signing_secret, timestamp, body)

    # Deliver with retries (throttle per URL to avoid receiver 429 bursts)
    attempt = task.request.retries + 1
    try:
        await wait_for_webhook_slot(webhook.url, settings.webhook_min_interval_seconds)
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
            if response_code == 429:
                retry_after = parse_retry_after(response.headers)
                base = max(
                    retry_after or 0.0,
                    float(settings.webhook_rate_limit_backoff_seconds),
                )
                backoff = int(base * (2 ** task.request.retries))
                logger.warning(
                    "webhook.rate_limited",
                    webhook_id=webhook_id,
                    job_id=job_id,
                    retry_in_s=backoff,
                    attempt=attempt,
                )
            else:
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


@celery_app.task(name="aria.run_scheduled_jobs")
def run_scheduled_jobs() -> None:
    """Celery Beat (every minute): fire jobs for matching reconciliation schedules."""
    try:
        asyncio.run(_run_scheduled_jobs_async())
    finally:
        _dispose_engine()


async def _run_scheduled_jobs_async() -> None:
    from datetime import datetime as _dt

    from app.core.database import session_scope
    from sqlalchemy import select

    now_utc = _dt.utcnow()
    current_time = now_utc.strftime("%H:%M")
    current_weekday = now_utc.weekday()  # 0=Monday … 6=Sunday

    async with session_scope() as session:
        from app.models.database import ReconciliationScheduleORM
        result = await session.execute(
            select(ReconciliationScheduleORM).where(ReconciliationScheduleORM.enabled.is_(True))
        )
        schedules = result.scalars().all()
        matching = [
            s for s in schedules
            if s.run_time_utc == current_time and current_weekday in (s.days_of_week or [])
        ]

    for schedule in matching:
        batch_tenant_transactions.delay(
            schedule.tenant_id,
            schedule.bank_account_id,
            schedule.base_currency,
        )
        logger.info(
            "schedule.triggered",
            schedule_id=schedule.id,
            tenant_id=schedule.tenant_id,
            run_time_utc=schedule.run_time_utc,
        )


async def trigger_webhooks(tenant_id: str, job_id: str, event: str, *, stage: str | None = None) -> None:
    """Called from pipeline_runner at status transitions."""
    from app.core.database import session_scope
    from app.repositories.webhook_repository import WebhookRepository

    async with session_scope() as session:
        repo = WebhookRepository(session)
        webhooks = await repo.get_enabled_for_event(tenant_id, event)

    for webhook in webhooks:
        deliver_webhook_task.delay(webhook.id, job_id, event, stage=stage)
