"""GET /api/v1/jobs/{id}/review — only UNCERTAIN items."""

from __future__ import annotations

import pytest

from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import MatchResult
from app.repositories.job_repository import JobRepository
from tests.conftest import TEST_TENANT_ID


@pytest.mark.asyncio
async def test_review_queue_filters_uncertain(api_client, db_session, normalised_record_usd, bank_entry_myr):
    repo = JobRepository(db_session, tenant_id=TEST_TENANT_ID)
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key=None)
    matches = [
        MatchResult(
            normalised_record=normalised_record_usd,
            bank_entry=bank_entry_myr,
            confidence=0.62,
            status=MatchStatus.UNCERTAIN,
        ),
        MatchResult(
            normalised_record=normalised_record_usd,
            bank_entry=bank_entry_myr,
            confidence=0.9,
            status=MatchStatus.MATCHED,
        ),
    ]
    await repo.replace_matches(job.id, matches)

    resp = await api_client.get(f"/api/v1/jobs/{job.id}/review")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["status"] == "UNCERTAIN"


@pytest.mark.asyncio
async def test_review_queue_returns_409_when_job_failed(api_client, db_session):
    repo = JobRepository(db_session, tenant_id=TEST_TENANT_ID)
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key=None)
    await repo.update_status(
        job.id,
        status=JobStatus.FAILED,
        error="Could not extract transaction rows from the PDF bank statement.",
    )

    resp = await api_client.get(f"/api/v1/jobs/{job.id}/review")
    assert resp.status_code == 409
    assert "PDF bank statement" in resp.json()["detail"] or "extract" in resp.json()["detail"].lower()
