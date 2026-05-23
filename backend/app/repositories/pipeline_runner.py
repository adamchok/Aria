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


async def execute_job(job_id: UUID | str) -> None:
    """Load the job from the database, run the pipeline, persist results."""
    bind_job_id(job_id)
    storage = StorageService()

    async with session_scope() as session:
        repo = JobRepository(session)
        job = await repo.get(job_id)
        await repo.update_status(job_id, status=JobStatus.INGESTING, progress_pct=5.0)

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
