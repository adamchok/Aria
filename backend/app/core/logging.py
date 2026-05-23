"""Structured JSON logging configured via structlog."""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any
from uuid import UUID

import structlog

_job_id_var: ContextVar[str | None] = ContextVar("job_id", default=None)


def bind_job_id(job_id: UUID | str | None) -> None:
    _job_id_var.set(str(job_id) if job_id is not None else None)


def _inject_job_id(_logger: Any, _method: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    job_id = _job_id_var.get()
    if job_id is not None and "job_id" not in event_dict:
        event_dict["job_id"] = job_id
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    """Configure structlog to emit JSON with job_id binding."""
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, level.upper(), logging.INFO),
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _inject_job_id,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
