"""Pipeline entry points — delegates to OpenAI Agents SDK runner."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from app.agents.sdk.runner import run_reconciliation, run_reconciliation_sync
from app.graph.state import ReconciliationState


async def arun_pipeline(
    state: ReconciliationState,
    *,
    on_stage_complete: Callable[[ReconciliationState, str], Awaitable[None]] | None = None,
) -> ReconciliationState:
    """Async pipeline driver (backward-compatible alias)."""
    return await run_reconciliation(state, on_stage_complete=on_stage_complete)


def run_pipeline(state: ReconciliationState) -> ReconciliationState:
    """Synchronous wrapper."""
    return run_reconciliation_sync(state)
