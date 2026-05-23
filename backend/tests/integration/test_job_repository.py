"""JobRepository CRUD."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.core.exceptions import JobNotFoundError, MatchNotFoundError
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import MatchResult
from app.repositories.job_repository import JobRepository


@pytest.mark.asyncio
async def test_create_and_fetch_job(db_session):
    repo = JobRepository(db_session)
    job = await repo.create_job(
        base_currency="MYR", payment_proof_keys=["k1"], bank_statement_key="kstmt"
    )
    fetched = await repo.get(job.id)
    assert fetched.id == job.id
    assert fetched.payment_proof_keys == ["k1"]


@pytest.mark.asyncio
async def test_get_missing_raises(db_session):
    repo = JobRepository(db_session)
    with pytest.raises(JobNotFoundError):
        await repo.get("00000000-0000-0000-0000-000000000000")


@pytest.mark.asyncio
async def test_update_status_and_progress(db_session):
    repo = JobRepository(db_session)
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key=None)
    await repo.update_status(
        job.id,
        status=JobStatus.MATCHING,
        progress_pct=50.0,
        agents_completed=["ingestion", "normalisation"],
    )
    fetched = await repo.get(job.id)
    assert fetched.status == JobStatus.MATCHING
    assert fetched.progress_pct == 50.0
    assert fetched.agents_completed == ["ingestion", "normalisation"]


@pytest.mark.asyncio
async def test_replace_matches_and_review_action(db_session, normalised_record_usd, bank_entry_myr):
    repo = JobRepository(db_session)
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key=None)
    match = MatchResult(
        normalised_record=normalised_record_usd,
        bank_entry=bank_entry_myr,
        confidence=0.6,
        status=MatchStatus.UNCERTAIN,
        amount_variance_myr=Decimal("0.10"),
        variance_explanation="",
        reasoning_chain="",
    )
    await repo.replace_matches(job.id, [match])

    fetched = await repo.list_matches(job.id, status=MatchStatus.UNCERTAIN)
    assert len(fetched) == 1
    updated = await repo.update_match(
        job.id, fetched[0].id, status=MatchStatus.MATCHED, review_notes="confirmed"
    )
    assert updated.status == MatchStatus.MATCHED
    assert updated.human_reviewed is True
    assert updated.review_notes == "confirmed"

    with pytest.raises(MatchNotFoundError):
        await repo.get_match(job.id, "00000000-0000-0000-0000-000000000000")
