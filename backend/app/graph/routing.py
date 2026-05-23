"""Conditional edges for the ReconciliationState graph."""

from __future__ import annotations

from app.core.config import get_settings
from app.graph.state import ReconciliationState


def after_ingestion(state: ReconciliationState) -> str:
    """Route to normalisation, or escalate if no usable records."""
    settings = get_settings()
    if not state.payment_records:
        return "human_review_queue"
    # If all records are below the extraction escalation threshold, escalate.
    avg_conf = sum(r.extraction_confidence for r in state.payment_records) / len(
        state.payment_records
    )
    if avg_conf < settings.extraction_escalation_threshold:
        return "human_review_queue"
    return "normalisation"


def after_normalisation(state: ReconciliationState) -> str:
    if not state.normalised_records:
        return "report"  # nothing to match — still produce an empty report
    return "matching"


def after_matching(state: ReconciliationState) -> str:
    return "report"
