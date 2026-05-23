"""Report hydration after human review."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models.enums import MatchStatus
from app.models.schemas import MatchResult, ReconciliationReport, ReconciliationSummary
from app.repositories.job_repository import JobRepository
from app.services.report_hydration import hydrate_report


@pytest.mark.asyncio
async def test_hydrate_report_reflects_confirmed_match(
    db_session, normalised_record_usd, bank_entry_myr
):
    repo = JobRepository(db_session)
    job = await repo.create_job(base_currency="MYR", payment_proof_keys=[], bank_statement_key=None)
    uncertain = MatchResult(
        normalised_record=normalised_record_usd,
        bank_entry=bank_entry_myr,
        confidence=0.68,
        status=MatchStatus.UNCERTAIN,
    )
    await repo.replace_matches(job.id, [uncertain])
    rows = await repo.list_matches(job.id)
    await repo.update_match(job.id, rows[0].id, status=MatchStatus.MATCHED)

    stale = ReconciliationReport(
        job_id=uuid4(),
        summary=ReconciliationSummary(
            total_records=1,
            matched_count=0,
            uncertain_count=1,
            unmatched_count=0,
            total_value_myr=Decimal("42.55"),
            matched_value_myr=Decimal("0"),
            total_variance_myr=Decimal("0.20"),
            processing_seconds=2.0,
        ),
        matches=[uncertain],
        generated_at=datetime.utcnow(),
    )
    job.report_blob = stale.model_dump(mode="json")
    hydrated = await hydrate_report(repo, job)
    assert hydrated.summary.matched_count == 1
    assert hydrated.summary.uncertain_count == 0
    assert hydrated.matches[0].status == MatchStatus.MATCHED
