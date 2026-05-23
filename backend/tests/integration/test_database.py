"""DB roundtrip tests for ORM models."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.database import AuditLogORM, JobORM, MatchORM
from app.models.enums import JobStatus, MatchStatus


@pytest.mark.asyncio
async def test_job_crud(db_session):
    job = JobORM(
        status=JobStatus.PENDING,
        base_currency="MYR",
        payment_proof_keys=["a/b.png", "a/c.pdf"],
        bank_statement_key="a/stmt.csv",
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    fetched = (await db_session.execute(select(JobORM).where(JobORM.id == job.id))).scalar_one()
    assert fetched.payment_proof_keys == ["a/b.png", "a/c.pdf"]
    assert fetched.status == JobStatus.PENDING


@pytest.mark.asyncio
async def test_match_and_audit_relationships(db_session):
    job = JobORM(status=JobStatus.COMPLETED, base_currency="MYR")
    db_session.add(job)
    await db_session.flush()

    match = MatchORM(
        job_id=job.id,
        status=MatchStatus.MATCHED,
        confidence=0.88,
        amount_variance_myr=Decimal("0.20"),
        variance_explanation="",
        reasoning_chain="",
        payload={"foo": "bar"},
    )
    audit = AuditLogORM(
        job_id=job.id,
        agent="ingestion",
        action="extract",
        confidence=0.92,
        reasoning="ok",
        timestamp=datetime.utcnow(),
    )
    db_session.add_all([match, audit])
    await db_session.commit()

    matches = (
        await db_session.execute(select(MatchORM).where(MatchORM.job_id == job.id))
    ).scalars().all()
    assert len(matches) == 1
    assert matches[0].payload == {"foo": "bar"}
