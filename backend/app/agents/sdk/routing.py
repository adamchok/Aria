"""Deterministic routing gates for the SDK pipeline."""

from __future__ import annotations

from app.agents.sdk.context import ReconciliationContext
from app.core.config import get_settings
from app.models.enums import JobStatus


def should_escalate_after_ingestion(ctx: ReconciliationContext) -> bool:
    """Mirror graph.routing.after_ingestion — escalate to human review."""
    settings = get_settings()
    if not ctx.state.payment_records:
        return True
    avg_conf = sum(r.extraction_confidence for r in ctx.state.payment_records) / len(
        ctx.state.payment_records
    )
    return avg_conf < settings.extraction_escalation_threshold


def should_run_matching(ctx: ReconciliationContext) -> bool:
    """Mirror graph.routing.after_normalisation."""
    return bool(ctx.state.normalised_records)


def mark_awaiting_review(ctx: ReconciliationContext) -> None:
    ctx.state.status = JobStatus.AWAITING_REVIEW
