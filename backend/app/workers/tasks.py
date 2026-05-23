"""Celery tasks driving the reconciliation pipeline.

For local/dev/test we expose ``enqueue_job`` which dispatches via Celery when
a broker is reachable and otherwise runs the pipeline inline (this keeps tests
hermetic without Redis).
"""

from __future__ import annotations

import asyncio
import os
from uuid import UUID

from app.core.config import get_settings
from app.core.logging import bind_job_id, get_logger
from app.repositories.pipeline_runner import execute_job
from app.workers.celery_app import celery_app

logger = get_logger(__name__)


@celery_app.task(name="aria.run_pipeline", bind=True, max_retries=2, default_retry_delay=10)
def run_pipeline_task(self, job_id: str) -> None:  # pragma: no cover — exercised via Celery
    bind_job_id(job_id)
    try:
        asyncio.run(execute_job(UUID(job_id)))
    except Exception as exc:
        logger.exception("celery.pipeline.error", error=str(exc))
        raise self.retry(exc=exc)


async def enqueue_job(job_id: str | UUID) -> None:
    """Dispatch a job to the worker, or run inline if Celery is unreachable.

    Inline execution covers two cases:
    * ``CELERY_TASK_ALWAYS_EAGER=1`` env override (tests).
    * No broker reachable — we fall back to running the pipeline in-process so
      the developer experience doesn't require Redis just to try ARIA.
    """
    job_id = str(job_id)
    settings = get_settings()
    bind_job_id(job_id)

    if os.getenv("CELERY_TASK_ALWAYS_EAGER") == "1" or settings.is_test:
        await execute_job(UUID(job_id))
        return

    try:
        run_pipeline_task.delay(job_id)
        logger.info("celery.enqueued", job_id=job_id)
    except Exception as exc:  # noqa: BLE001 — log + fall back
        logger.warning("celery.unreachable.falling_back_inline", error=str(exc))
        await execute_job(UUID(job_id))
