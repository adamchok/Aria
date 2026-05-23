"""Build the LangGraph StateGraph for the reconciliation pipeline.

We keep the LangGraph dependency optional at import time by exposing both a
``build_graph`` (LangGraph) entry point and a ``run_pipeline`` synchronous
fallback that drives the same nodes manually. Tests use the synchronous
fallback so they don't depend on a specific LangGraph version.
"""

from __future__ import annotations

from datetime import datetime

from app.agents.ingestion import IngestionAgent
from app.agents.matching import MatchingAgent
from app.agents.normalisation import NormalisationAgent
from app.agents.report import ReportAgent
from app.core.logging import bind_job_id, get_logger
from app.graph.routing import after_ingestion, after_matching, after_normalisation
from app.graph.state import ReconciliationState
from app.models.enums import JobStatus

logger = get_logger(__name__)


def build_graph():
    """Construct the LangGraph state machine."""
    from langgraph.graph import END, StateGraph

    ingestion = IngestionAgent()
    normalisation = NormalisationAgent()
    matching = MatchingAgent()
    report = ReportAgent()

    g = StateGraph(ReconciliationState)
    g.add_node("ingestion", ingestion)
    g.add_node("normalisation", normalisation)
    g.add_node("matching", matching)
    g.add_node("report", report)
    g.add_node("human_review_queue", _passthrough_review)

    g.set_entry_point("ingestion")
    g.add_conditional_edges(
        "ingestion",
        after_ingestion,
        {
            "normalisation": "normalisation",
            "human_review_queue": "human_review_queue",
        },
    )
    g.add_conditional_edges(
        "normalisation",
        after_normalisation,
        {"matching": "matching", "report": "report"},
    )
    g.add_conditional_edges("matching", after_matching, {"report": "report"})
    g.add_edge("report", END)
    g.add_edge("human_review_queue", "report")

    return g.compile()


def _passthrough_review(state: ReconciliationState) -> ReconciliationState:
    """Mark the job as awaiting review when ingestion produced nothing usable.

    The report node will still run afterwards and produce an (empty / partial)
    report so consumers always have something to display.
    """
    state.status = JobStatus.AWAITING_REVIEW
    return state


async def arun_pipeline(state: ReconciliationState) -> ReconciliationState:
    """Async driver that executes the same nodes/routing without LangGraph.

    Used by the API/Celery path where we're already inside an event loop.
    Behaviour mirrors :func:`build_graph`.
    """
    bind_job_id(state.job_id)
    state.started_at = state.started_at or datetime.utcnow()

    state = IngestionAgent()(state)
    next_node = after_ingestion(state)
    if next_node == "human_review_queue":
        _passthrough_review(state)
    else:
        state = await NormalisationAgent().arun(state)
        if after_normalisation(state) == "matching":
            state = MatchingAgent()(state)

    state = ReportAgent()(state)
    return state


def run_pipeline(state: ReconciliationState) -> ReconciliationState:
    """Synchronous wrapper. Use ``arun_pipeline`` from async contexts."""
    import asyncio

    return asyncio.run(arun_pipeline(state))
