"""Glue between the OpenAI Agents SDK pipeline and persistent storage."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.agents.audit import make_audit_entry
from app.core.database import session_scope
from app.core.logging import bind_job_id, get_logger
from app.agents.sdk.runner import run_reconciliation
from app.graph.state import DocumentInput, ReconciliationState
from app.models.enums import JobStatus, MatchStatus
from app.repositories.bank_ledger_repository import BankLedgerRepository
from app.repositories.job_repository import JobRepository
from app.repositories.vendor_rules_repository import VendorRulesRepository
from app.services.storage import StorageService

logger = get_logger(__name__)


def _basename(storage_key: str) -> str:
    """Return the filename portion of a storage key.

    Storage keys are <uuid>/<filename>. Old keys from before the corridor-slash
    fix may look like <uuid>/proof_USD/MYR.bin — take only the last segment so
    detect_source_format gets a clean name without embedded path separators.
    """
    return storage_key.rsplit("/", 1)[-1]

_STAGE_PROGRESS_PCT: dict[str, float] = {
    "ingestion": 25.0,
    "normalisation": 50.0,
    "matching": 75.0,
    "report": 95.0,
}


async def _publish_stage_progress(
    job_id: UUID | str,
    tenant_id: str | None,
    state: ReconciliationState,
    agent: str,
) -> None:
    """Persist and broadcast pipeline stage completion for live progress UI."""
    progress_pct = _STAGE_PROGRESS_PCT.get(agent, 0.0)
    agents = list(state.agents_completed)
    async with session_scope() as session:
        repo = JobRepository(session)
        await repo.update_status(
            job_id,
            status=state.status,
            progress_pct=progress_pct,
            agents_completed=agents,
        )
    payload = {
        "status": state.status,
        "progress_pct": progress_pct,
        "agents_completed": agents,
        "agent": agent,
    }
    await _emit(str(job_id), tenant_id, "agent_complete", payload)
    await _emit(str(job_id), tenant_id, "status_change", payload)
    await _emit(str(job_id), tenant_id, "progress_update", {"progress_pct": progress_pct})


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

    if event == "agent_complete" and tenant_id:
        try:
            from app.workers.tasks import trigger_webhooks
            await trigger_webhooks(tenant_id, job_id, "job.stage_completed")
        except Exception:  # noqa: BLE001
            pass


async def execute_job(job_id: UUID | str) -> None:
    """Load the job from the database, run the pipeline, persist results."""
    bind_job_id(job_id)
    storage = StorageService()
    job_id_str = str(job_id)

    # Capture ALL scalar fields inside session scope — ORM objects detach on exit
    # and attribute access raises DetachedInstanceError on lazy-loaded columns.
    tenant_id: str | None = None
    bank_statement_id_str: str | None = None
    bank_account_id_str: str | None = None
    base_currency: str = "MYR"
    payment_proof_keys: list[str] = []
    bank_statement_key: str | None = None

    async with session_scope() as session:
        repo = JobRepository(session)
        job = await repo.get(job_id)
        tenant_id = job.tenant_id
        bank_statement_id_str = job.bank_statement_id
        bank_account_id_str = job.bank_account_id
        base_currency = job.base_currency
        payment_proof_keys = list(job.payment_proof_keys or [])
        bank_statement_key = job.bank_statement_key
        await repo.update_status(job_id, status=JobStatus.INGESTING, progress_pct=5.0)

    await _emit(job_id_str, tenant_id, "status_change", {"status": "INGESTING", "progress_pct": 5.0})

    # Build initial state.
    state = ReconciliationState(
        job_id=UUID(job_id_str),
        base_currency=base_currency,
        payment_documents=[
            DocumentInput(storage_key=key, filename=_basename(key))
            for key in payment_proof_keys
        ],
        bank_statement_input=(
            DocumentInput(
                storage_key=bank_statement_key,
                filename=_basename(bank_statement_key),
            )
            if bank_statement_key
            else None
        ),
        bank_statement_id=UUID(bank_statement_id_str) if bank_statement_id_str else None,
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

    # If a ledger reference is set, load uncleared entries into state so matching
    # works with persistent bank data instead of a one-off uploaded file.
    if bank_account_id_str or bank_statement_id_str:
        async with session_scope() as session:
            ledger = BankLedgerRepository(session, tenant_id=tenant_id)
            if bank_account_id_str:
                state.bank_statement = await ledger.get_account_uncleared_as_bank_statement(
                    bank_account_id_str, base_currency
                )
                ledger_ref = bank_account_id_str
                ledger_kind = "account"
            else:
                state.bank_statement = await ledger.get_uncleared_as_bank_statement(
                    bank_statement_id_str, base_currency
                )
                ledger_ref = bank_statement_id_str
                ledger_kind = "statement"
        entry_count = len(state.bank_statement.entries) if state.bank_statement else 0
        logger.info(
            "pipeline.ledger_loaded",
            ledger_kind=ledger_kind,
            ledger_ref=ledger_ref,
            entries=entry_count,
        )
        state.audit_log.append(
            make_audit_entry(
                job_id=UUID(job_id_str),
                agent="bank_statement_ingestion",
                action="ledger_loaded",
                input_snapshot={
                    "ledger_kind": ledger_kind,
                    "ledger_ref": ledger_ref,
                },
                output_snapshot={"entry_count": entry_count},
                reasoning=(
                    f"Loaded {entry_count} pending ledger "
                    f"{'entries' if entry_count != 1 else 'entry'} from database "
                    f"for {ledger_kind} {ledger_ref}."
                ),
            )
        )
        if entry_count == 0:
            logger.warning(
                "pipeline.ledger_empty",
                ledger_kind=ledger_kind,
                ledger_ref=ledger_ref,
                detail="All entries already cleared — all payment records will be UNMATCHED.",
            )

    # Load vendor rules before running pipeline so the ingestion stage can apply
    # corrections learned from past human reviews.
    vendor_rules: list[dict] = []
    if tenant_id:
        async with session_scope() as session:
            rules_repo = VendorRulesRepository(session, tenant_id=tenant_id)
            vendor_rules = await rules_repo.find_for_tenant()
        if vendor_rules:
            logger.info("pipeline.vendor_rules_loaded", count=len(vendor_rules))

    try:
        async def on_stage_complete(state: ReconciliationState, agent: str) -> None:
            await _publish_stage_progress(job_id, tenant_id, state, agent)

        state = await run_reconciliation(
            state,
            on_stage_complete=on_stage_complete,
            tenant_id=tenant_id,
            vendor_rules=vendor_rules,
        )
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

    # Mark ledger entries as cleared for all auto-confirmed matches.
    # tenant_id scopes the repo — only entries belonging to this tenant are touched.
    if (bank_statement_id_str or bank_account_id_str) and state.match_results:
        matched_entry_ids = [
            m.bank_entry.id
            for m in state.match_results
            if m.status == MatchStatus.MATCHED and m.bank_entry is not None
        ]
        if matched_entry_ids:
            async with session_scope() as session:
                ledger = BankLedgerRepository(session, tenant_id=tenant_id)
                cleared = await ledger.clear_entries(matched_entry_ids, job_id)
            logger.info("pipeline.ledger_cleared", count=cleared, job_id=job_id_str)

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
