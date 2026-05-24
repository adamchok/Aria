"""Glue between the LangGraph pipeline and persistent storage."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.core.database import session_scope
from app.core.logging import bind_job_id, get_logger
from app.graph.builder import arun_pipeline
from app.graph.state import DocumentInput, ReconciliationState
from app.models.enums import JobStatus
from app.repositories.job_repository import JobRepository
from app.services.storage import StorageService

logger = get_logger(__name__)


async def _emit(job_id: str, tenant_id: str | None, event: str, data: dict) -> None:
    """Publish SSE event and (for terminal events) trigger webhooks."""
    try:
        from app.api.v1.stream import publish_event
        await publish_event(job_id, event, data)
    except Exception:  # noqa: BLE001 — never block pipeline on SSE failure
        pass

    if event in {"completed", "error", "review_required"} and tenant_id:
        try:
            from app.workers.tasks import trigger_webhooks
            webhook_event_map = {
                "completed": "job.completed",
                "error": "job.failed",
                "review_required": "job.review_required",
            }
            await trigger_webhooks(tenant_id, job_id, webhook_event_map[event])
        except Exception:  # noqa: BLE001
            pass


async def execute_job(job_id: UUID | str) -> None:
    """Load the job from the database, run the pipeline, persist results."""
    bind_job_id(job_id)
    storage = StorageService()
    job_id_str = str(job_id)

    async with session_scope() as session:
        repo = JobRepository(session)
        job = await repo.get(job_id)
        tenant_id = job.tenant_id
        await repo.update_status(job_id, status=JobStatus.INGESTING, progress_pct=5.0)

    await _emit(job_id_str, tenant_id, "status_change", {"status": "INGESTING", "progress_pct": 5.0})

    # Build initial state.
    state = ReconciliationState(
        job_id=UUID(str(job.id)),
        base_currency=job.base_currency,
        payment_documents=[
            DocumentInput(storage_key=key, filename=key.split("/", 1)[-1])
            for key in job.payment_proof_keys
        ],
        bank_statement_input=(
            DocumentInput(
                storage_key=job.bank_statement_key,
                filename=job.bank_statement_key.split("/", 1)[-1],
            )
            if job.bank_statement_key
            else None
        ),
        started_at=datetime.utcnow(),
    )

    # Resolve bytes once up-front so the agents don't need the storage layer
    # mid-pipeline.
    for doc in state.payment_documents:
        doc.bytes_data = storage.get_object(doc.storage_key)
    if state.bank_statement_input is not None:
        state.bank_statement_input.bytes_data = storage.get_object(
            state.bank_statement_input.storage_key
        )

    try:
        state = await arun_pipeline(state)
    except Exception as exc:  # noqa: BLE001 — log and persist
        logger.exception("pipeline.failed", error=str(exc))
        async with session_scope() as session:
            repo = JobRepository(session)
            await repo.update_status(
                job_id,
                status=JobStatus.FAILED,
                error=str(exc),
                progress_pct=100.0,
                agents_completed=state.agents_completed,
            )
        await _emit(job_id_str, tenant_id, "error", {"status": "FAILED", "error": str(exc)})
        return

    async with session_scope() as session:
        repo = JobRepository(session)
        await repo.replace_matches(job_id, state.match_results)
        if state.report is not None:
            await repo.save_report(job_id, state.report.model_dump(mode="json"))
        await repo.append_audit(state.audit_log)
        await repo.update_status(
            job_id,
            status=state.status,
            progress_pct=100.0,
            agents_completed=state.agents_completed,
        )

    # Terminal SSE event
    terminal_event = "review_required" if state.status == JobStatus.AWAITING_REVIEW else "completed"
    summary_data: dict = {"status": state.status}
    if state.report:
        s = state.report.summary
        summary_data["summary"] = {
            "matched": s.matched_count,
            "uncertain": s.uncertain_count,
            "unmatched": s.unmatched_count,
            "total": s.total_records,
        }
    await _emit(job_id_str, tenant_id, terminal_event, summary_data)
