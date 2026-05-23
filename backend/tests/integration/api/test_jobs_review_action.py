"""POST /api/v1/jobs/{id}/review/{match_id} — confirm/reject/manual_match + idempotency."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.models.enums import MatchStatus
from app.models.schemas import MatchResult
from app.repositories.job_repository import JobRepository


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
    return job.id, rows[0].id


@pytest.mark.asyncio
async def test_confirm_marks_matched(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(JobRepository(db_session), normalised_record_usd, bank_entry_myr)
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
    job_id, match_id = await _seed_uncertain(JobRepository(db_session), normalised_record_usd, bank_entry_myr)
    resp = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "reject"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "UNMATCHED"


@pytest.mark.asyncio
async def test_manual_match_requires_bank_entry_id(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(JobRepository(db_session), normalised_record_usd, bank_entry_myr)
    bad = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "manual_match"}
    )
    assert bad.status_code == 400

    good = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}",
        json={"action": "manual_match", "bank_entry_id": str(uuid4())},
    )
    assert good.status_code == 200
    assert good.json()["status"] == "MATCHED"


@pytest.mark.asyncio
async def test_review_action_is_idempotent(api_client, db_session, normalised_record_usd, bank_entry_myr):
    job_id, match_id = await _seed_uncertain(JobRepository(db_session), normalised_record_usd, bank_entry_myr)
    first = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "confirm"}
    )
    second = await api_client.post(
        f"/api/v1/jobs/{job_id}/review/{match_id}", json={"action": "confirm"}
    )
    assert first.json() == second.json()
