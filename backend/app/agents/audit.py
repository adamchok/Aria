"""Helpers for appending audit log entries from agent nodes."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from app.models.schemas import AuditLogEntry


def make_audit_entry(
    *,
    job_id: UUID,
    agent: str,
    action: str,
    input_snapshot: dict[str, Any] | None = None,
    output_snapshot: dict[str, Any] | None = None,
    reasoning: str = "",
    confidence: float | None = None,
) -> AuditLogEntry:
    return AuditLogEntry(
        job_id=job_id,
        agent=agent,
        action=action,
        input_snapshot=input_snapshot or {},
        output_snapshot=output_snapshot or {},
        reasoning=reasoning,
        confidence=confidence,
        timestamp=datetime.utcnow(),
    )
