"""GET /api/v1/jobs/{id}/bank-entries — ledger rows for manual match picker."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.models.enums import MatchStatus
from app.models.schemas import BankEntry, MatchResult, ReconciliationReport, ReconciliationSummary
from app.repositories.job_repository import JobRepository
from tests.conftest import TEST_TENANT_ID


async def _seed_file_upload_job(repo, normalised, bank_entries: list[BankEntry]):
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key="k/stmt.csv")
    match = MatchResult(
        normalised_record=normalised,
        bank_entry=bank_entries[0] if bank_entries else None,
        confidence=0.6,
        status=MatchStatus.UNCERTAIN,
    )
    await repo.replace_matches(job.id, [match])
    report = ReconciliationReport(
        job_id=UUID(str(job.id)),
        summary=ReconciliationSummary(
            total_records=1,
            matched_count=0,
            uncertain_count=1,
            unmatched_count=0,
            total_value_myr=match.normalised_record.amount_myr_at_settlement_rate,
            matched_value_myr=Decimal("0"),
            total_variance_myr=match.amount_variance_myr,
            processing_seconds=1.0,
        ),
        matches=[match],
        bank_entries=bank_entries,
        generated_at=datetime.utcnow(),
    )
    await repo.save_report(job.id, report.model_dump(mode="json"))
    return job.id


@pytest.mark.asyncio
async def test_bank_entries_from_report_snapshot(
    api_client, db_session, normalised_record_usd, bank_entry_myr
):
    second = bank_entry_myr.model_copy(update={"id": uuid4(), "reference": "INV-002"})
    job_id = await _seed_file_upload_job(
        JobRepository(db_session, tenant_id=TEST_TENANT_ID),
        normalised_record_usd,
        [bank_entry_myr, second],
    )
    resp = await api_client.get(f"/api/v1/jobs/{job_id}/bank-entries")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    ids = {row["id"] for row in body}
    assert str(bank_entry_myr.id) in ids
    assert str(second.id) in ids


@pytest.mark.asyncio
async def test_bank_entries_job_not_found(api_client):
    resp = await api_client.get(f"/api/v1/jobs/{uuid4()}/bank-entries")
    assert resp.status_code == 404
