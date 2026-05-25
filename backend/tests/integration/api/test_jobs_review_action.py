"""POST /api/v1/jobs/{id}/review/{match_id} — confirm/reject/manual_match + idempotency."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.models.enums import MatchStatus
from app.models.schemas import MatchResult, ReconciliationReport, ReconciliationSummary
from app.repositories.job_repository import JobRepository
from tests.conftest import TEST_TENANT_ID


async def _seed_uncertain(repo, normalised, bank_entry):
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key=None)
    match = MatchResult(
        normalised_record=normalised,
        bank_entry=bank_entry,
        confidence=0.6,
        status=MatchStatus.UNCERTAIN,
    )
    await repo.replace_matches(job.id, [match])
    rows = await repo.list_matches(job.id, status=MatchStatus.UNCERTAIN)
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
        generated_at=datetime.utcnow(),
        narrative="Initial snapshot",
    )
    await repo.save_report(job.id, report.model_dump(mode="json"))
    return job.id, rows[0].id


@pytest.mark.asyncio
async def test_confirm_marks_matched(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(
        JobRepository(db_session, tenant_id=TEST_TENANT_ID), normalised_record_usd, bank_entry_myr
    )
    resp = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}",
        json={"action": "confirm", "note": "looks good"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "MATCHED"
    assert body["human_reviewed"] is True


@pytest.mark.asyncio
async def test_reject_marks_unmatched(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(
        JobRepository(db_session, tenant_id=TEST_TENANT_ID), normalised_record_usd, bank_entry_myr
    )
    resp = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "reject"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "UNMATCHED"


@pytest.mark.asyncio
async def test_manual_match_requires_bank_entry_id(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(
        JobRepository(db_session, tenant_id=TEST_TENANT_ID), normalised_record_usd, bank_entry_myr
    )
    bad = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "manual_match"}
    )
    assert bad.status_code == 400

    good = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}",
        json={"action": "manual_match", "bank_entry_id": str(bank_entry_myr.id)},
    )
    assert good.status_code == 200
    assert good.json()["status"] == "MATCHED"

    missing = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}",
        json={"action": "manual_match", "bank_entry_id": str(uuid4())},
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_confirm_updates_results_report(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(
        JobRepository(db_session, tenant_id=TEST_TENANT_ID), normalised_record_usd, bank_entry_myr
    )
    confirm = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "confirm"}
    )
    assert confirm.status_code == 200

    results = await api_client.get(f"/api/v1/jobs/{job_id}/results")
    assert results.status_code == 200
    body = results.json()
    assert body["summary"]["matched_count"] == 1
    assert body["summary"]["uncertain_count"] == 0
    assert body["matches"][0]["status"] == "MATCHED"


@pytest.mark.asyncio
async def test_review_action_is_idempotent(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(
        JobRepository(db_session, tenant_id=TEST_TENANT_ID), normalised_record_usd, bank_entry_myr
    )
    first = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "confirm"}
    )
    second = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "confirm"}
    )
    assert first.json() == second.json()


@pytest.mark.asyncio
async def test_manual_match_without_candidate_persists_bank_entry(
    api_client, db_session, normalised_record_usd, bank_entry_myr
):
    repo = JobRepository(db_session, tenant_id=TEST_TENANT_ID)
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key="k/stmt.csv")
    match = MatchResult(
        normalised_record=normalised_record_usd,
        bank_entry=None,
        confidence=0.62,
        status=MatchStatus.UNCERTAIN,
    )
    await repo.replace_matches(job.id, [match])
    rows = await repo.list_matches(job.id)
    report = ReconciliationReport(
        job_id=UUID(str(job.id)),
        summary=ReconciliationSummary(
            total_records=1,
            matched_count=0,
            uncertain_count=1,
            unmatched_count=0,
            total_value_myr=match.normalised_record.amount_myr_at_settlement_rate,
            matched_value_myr=Decimal("0"),
            total_variance_myr=Decimal("0"),
            processing_seconds=1.0,
        ),
        matches=[match],
        bank_entries=[bank_entry_myr],
        generated_at=datetime.utcnow(),
    )
    await repo.save_report(job.id, report.model_dump(mode="json"))

    resp = await api_client.post(
        f"/api/v1/jobs/{job.id}/review/{rows[0].id}",
        json={
            "action": "manual_match",
            "bank_entry_id": str(bank_entry_myr.id),
            "note": "Matched to Moonshot debit",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "MATCHED"
    assert body["note"] == "Matched to Moonshot debit"
    assert body["bank_entry"]["id"] == str(bank_entry_myr.id)

    results = await api_client.get(f"/api/v1/jobs/{job.id}/results")
    assert results.json()["matches"][0]["bank_entry"]["id"] == str(bank_entry_myr.id)


_CREATE_PAYLOAD = {
    "name": "Main Operating Account",
    "bank_name": "Maybank",
    "account_number_masked": "****1234",
    "currency": "MYR",
}

_LEDGER_CSV = (
    "Date,Amount,Description,Reference\n"
    "2026-05-01,42.30,Inward Telegraphic Transfer Acme US Inc,INV-001\n"
).encode()


async def _seed_ledger_review_job(
    api_client,
    db_session,
    normalised_record_usd,
    *,
    include_bank_entry: bool = True,
):
    from app.models.enums import JobStatus
    from app.models.schemas import BankEntry

    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]
    await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("stmt.csv", _LEDGER_CSV, "text/csv")},
    )
    ledger_resp = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger")
    ledger_item = ledger_resp.json()["items"][0]
    entry = BankEntry(
        id=UUID(ledger_item["id"]),
        value_date=date.fromisoformat(ledger_item["value_date"]),
        amount=Decimal(ledger_item["amount"]),
        currency=ledger_item["currency"],
        description=ledger_item["description"],
        reference=ledger_item.get("reference"),
        counterparty=ledger_item.get("counterparty"),
    )

    repo = JobRepository(db_session, tenant_id=TEST_TENANT_ID)
    job = await repo.create_job(
        base_currency="MYR",
        payment_proof_keys=[],
        bank_statement_key=None,
        bank_account_id=acc_id,
    )
    await repo.update_status(job.id, status=JobStatus.AWAITING_REVIEW)
    match = MatchResult(
        normalised_record=normalised_record_usd,
        bank_entry=entry if include_bank_entry else None,
        confidence=0.6,
        status=MatchStatus.UNCERTAIN,
    )
    await repo.replace_matches(job.id, [match])
    rows = await repo.list_matches(job.id, status=MatchStatus.UNCERTAIN)
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
        generated_at=datetime.utcnow(),
    )
    await repo.save_report(job.id, report.model_dump(mode="json"))
    return job.id, rows[0].id, acc_id, str(entry.id)


@pytest.mark.asyncio
async def test_confirm_clears_ledger_entry(api_client, db_session, normalised_record_usd):
    job_id, match_id, acc_id, entry_id = await _seed_ledger_review_job(
        api_client, db_session, normalised_record_usd
    )
    resp = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}",
        json={"action": "confirm", "note": "confirmed"},
    )
    assert resp.status_code == 200

    ledger = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger?cleared=true")
    assert ledger.status_code == 200
    assert ledger.json()["total"] == 1
    assert ledger.json()["items"][0]["id"] == entry_id
    assert ledger.json()["items"][0]["cleared_by_job_id"] == str(job_id)


@pytest.mark.asyncio
async def test_manual_match_clears_ledger_entry(api_client, db_session, normalised_record_usd):
    job_id, match_id, acc_id, entry_id = await _seed_ledger_review_job(
        api_client,
        db_session,
        normalised_record_usd,
        include_bank_entry=False,
    )

    resp = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}",
        json={"action": "manual_match", "bank_entry_id": entry_id},
    )
    assert resp.status_code == 200

    ledger = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger?cleared=true")
    assert ledger.json()["total"] == 1
    assert ledger.json()["items"][0]["cleared_by_job_id"] == str(job_id)
