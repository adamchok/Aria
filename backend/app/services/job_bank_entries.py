"""Resolve bank ledger entries available for manual match on a job."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.models.database import BankEntryORM, JobORM
from app.models.schemas import BankEntry, ReconciliationReport
from app.repositories.bank_ledger_repository import BankLedgerRepository
from app.repositories.job_repository import JobRepository


def bank_entry_from_orm(entry: BankEntryORM) -> BankEntry:
    return BankEntry(
        id=UUID(entry.id),
        value_date=entry.value_date,
        amount=Decimal(str(entry.amount)),
        currency=entry.currency,
        description=entry.description or "",
        reference=entry.reference,
        counterparty=entry.counterparty,
        raw_row=entry.raw_row or {},
    )


async def list_job_bank_entries(
    job: JobORM,
    job_repo: JobRepository,
    ledger_repo: BankLedgerRepository,
) -> list[BankEntry]:
    """Return bank entries the reviewer can attach via manual match."""
    base_currency = job.base_currency or "MYR"

    if job.report_blob:
        report = ReconciliationReport.model_validate(job.report_blob)
        if report.bank_entries:
            return report.bank_entries

    if job.bank_account_id:
        statement = await ledger_repo.get_account_uncleared_as_bank_statement(
            UUID(job.bank_account_id), base_currency
        )
        return statement.entries

    if job.bank_statement_id:
        statement = await ledger_repo.get_uncleared_as_bank_statement(
            UUID(job.bank_statement_id), base_currency
        )
        return statement.entries

    seen: dict[str, BankEntry] = {}
    for row in await job_repo.list_matches(job.id):
        payload = row.payload or {}
        raw = payload.get("bank_entry")
        if not raw:
            continue
        entry = BankEntry.model_validate(raw)
        seen[str(entry.id)] = entry
    return list(seen.values())


async def resolve_manual_match_bank_entry(
    job: JobORM,
    entry_id: UUID,
    job_repo: JobRepository,
    ledger_repo: BankLedgerRepository,
) -> BankEntry:
    entry_orm = await ledger_repo.get_entry(entry_id)
    if entry_orm is not None:
        return bank_entry_from_orm(entry_orm)

    for entry in await list_job_bank_entries(job, job_repo, ledger_repo):
        if entry.id == entry_id:
            return entry

    raise ValueError(f"bank entry {entry_id} not found for this job")
