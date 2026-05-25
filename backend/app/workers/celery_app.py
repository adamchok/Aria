"""Celery application instance."""

from __future__ import annotations

import asyncio
import os
import sys

from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

# asyncpg uses selector-based I/O; ProactorEventLoop (Windows default) corrupts
# the IOCP port after the first asyncio.run() closes it, causing subsequent
# asyncio.run() calls in the same worker process to hit
# AttributeError: 'NoneType' object has no attribute 'send'.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

_settings = get_settings()

celery_app = Celery(
    "aria",
    broker=_settings.celery_broker_url,
    backend=_settings.celery_result_backend,
    include=["app.workers.tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_send_task_events=True,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "auto-batch-transactions": {
            "task": "aria.auto_batch_transactions",
            "schedule": _settings.celery_beat_interval_minutes * 60,  # seconds
        },
    },
)
if os.getenv("CELERY_TASK_ALWAYS_EAGER") == "1" or _settings.is_test:
    celery_app.conf.task_always_eager = True
