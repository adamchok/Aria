"""Async pipeline driver — deterministic orchestration with SDK stage modules."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import datetime

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.agents.sdk.provider import configure_agents_sdk_tracing
from app.agents.sdk.routing import (
    mark_awaiting_review,
    should_escalate_after_ingestion,
    should_run_matching,
)
from app.agents.sdk.stages.ingestion import run_ingestion_stage
from app.agents.sdk.stages.matching import run_matching_stage
from app.agents.sdk.stages.normalisation import run_normalisation_stage
from app.agents.sdk.stages.report import run_report_stage
from app.core.logging import bind_job_id, get_logger
from app.graph.state import ReconciliationState

logger = get_logger(__name__)


async def run_reconciliation(
    state: ReconciliationState,
    *,
    on_stage_complete: Callable[[ReconciliationState, str], Awaitable[None]] | None = None,
    tenant_id: str | None = None,
    vendor_rules: list[dict] | None = None,
) -> ReconciliationState:
    """Run the full reconciliation pipeline (replaces ``arun_pipeline``).

    Orchestration is deterministic Python — specialist SDK Agents are invoked
    via stage modules that call ``LLMService`` (Anthropic) with RTCIOC prompts.
    Routing gates mirror the former LangGraph conditional edges.
    """
    bind_job_id(state.job_id)
    configure_agents_sdk_tracing()
    state.started_at = state.started_at or datetime.utcnow()

    ctx = ReconciliationContext(
        state=state,
        tenant_id=tenant_id,
        vendor_rules=vendor_rules or [],
    )
    llm = LLMService(ctx.settings)

    logger.info(
        "pipeline.start",
        proofs=len(state.payment_documents),
        ledger_entries=len(state.bank_statement.entries) if state.bank_statement else 0,
    )

    # Stage 1: Ingestion (+ optional bank statement file parse)
    await run_ingestion_stage(ctx, llm=llm)
    if on_stage_complete:
        await on_stage_complete(state, "ingestion")

    if should_escalate_after_ingestion(ctx):
        mark_awaiting_review(ctx)
        logger.info("pipeline.escalated_after_ingestion")
    else:
        # Stage 2: Normalisation
        await run_normalisation_stage(ctx)
        if on_stage_complete:
            await on_stage_complete(state, "normalisation")

        if should_run_matching(ctx):
            # Stage 3: Matching
            run_matching_stage(ctx, llm=llm)
            if on_stage_complete:
                await on_stage_complete(state, "matching")

    # Stage 4: Report (always — even partial/empty)
    run_report_stage(ctx, llm=llm)
    if on_stage_complete:
        await on_stage_complete(state, "report")

    return state


def run_reconciliation_sync(state: ReconciliationState) -> ReconciliationState:
    """Synchronous wrapper."""
    import asyncio

    return asyncio.run(run_reconciliation(state))
