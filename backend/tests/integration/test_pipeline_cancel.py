"""Pipeline respects user-initiated job cancellation."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core import database as db_module
from app.models.enums import JobStatus
from app.repositories.job_repository import JobRepository
from app.repositories.pipeline_runner import execute_job
from tests.conftest import TEST_TENANT_ID


@pytest.mark.asyncio
async def test_execute_job_stops_when_cancelled_mid_pipeline(db_engine, db_session):
    test_factory = async_sessionmaker(db_engine, expire_on_commit=False, class_=AsyncSession)
    original_factory = db_module._session_factory
    db_module._session_factory = test_factory

    repo = JobRepository(db_session, tenant_id=TEST_TENANT_ID)
    job = await repo.create_job(
        base_currency="MYR",
        payment_proof_keys=["proofs/test.png"],
        bank_statement_key=None,
        tenant_id=TEST_TENANT_ID,
    )

    async def fake_run_reconciliation(state, on_stage_complete=None, **kwargs):
        if on_stage_complete:
            await on_stage_complete(state, "ingestion")
        await repo.update_status(job.id, status=JobStatus.CANCELLED)
        if on_stage_complete:
            await on_stage_complete(state, "normalisation")
        return state

    try:
        with patch(
            "app.repositories.pipeline_runner.run_reconciliation",
            new=AsyncMock(side_effect=fake_run_reconciliation),
        ):
            with patch("app.repositories.pipeline_runner.StorageService") as storage_cls:
                storage_cls.return_value.get_object.return_value = b"MOCK|USD 10"
                await execute_job(job.id)
    finally:
        db_module._session_factory = original_factory

    refreshed = await repo.get(job.id)
    assert JobStatus(refreshed.status) == JobStatus.CANCELLED
    assert refreshed.report_blob is None
