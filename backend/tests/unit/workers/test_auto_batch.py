"""Auto-batch job creation — corridor grouping and partial batch marking."""

from __future__ import annotations

import pytest

from app.models.enums import BufferStatus
from app.repositories.ingest_repository import IngestRepository
from app.workers.tasks import _create_batch_jobs


@pytest.mark.asyncio
async def test_batch_marks_only_included_transactions(db_session):
    """Overflow buffered txs stay BUFFERED when count exceeds threshold."""
    tenant_id = "00000000-0000-0000-0001-000000000001"
    ingest_repo = IngestRepository(db_session)
    items = [{"storage_key": f"proofs/{i}.png", "corridor": "USD/MYR"} for i in range(60)]
    await ingest_repo.buffer_transactions(tenant_id, items)
    buffered = await ingest_repo.get_buffered_by_tenant(tenant_id)
    assert len(buffered) == 60

    from app.repositories.bank_account_repository import BankAccountRepository

    account_repo = BankAccountRepository(db_session, tenant_id=tenant_id)
    acc = await account_repo.create(
        name="Batch Test",
        bank_name="Maybank",
        account_number_masked="****1111",
        currency="MYR",
    )
    from datetime import date
    from decimal import Decimal

    from app.models.schemas import BankEntry, BankStatement
    from app.repositories.bank_ledger_repository import BankLedgerRepository

    ledger = BankLedgerRepository(db_session, tenant_id=tenant_id)
    stmt = BankStatement(
        base_currency="MYR",
        entries=[BankEntry(value_date=date(2026, 5, 1), amount=Decimal("100"), currency="MYR")],
    )
    await ledger.create_statement(
        filename="ledger.csv",
        storage_key=None,
        base_currency="MYR",
        statement=stmt,
        account_id=acc.id,
    )

    job_ids = await _create_batch_jobs(
        db_session,
        tenant_id=tenant_id,
        buffered=buffered,
        bank_account_id=acc.id,
        batch_size_threshold=50,
    )
    assert len(job_ids) == 1

    remaining = await ingest_repo.get_buffered_by_tenant(tenant_id)
    assert len(remaining) == 10

    from sqlalchemy import select

    from app.models.database import TransactionBufferORM

    result = await db_session.execute(
        select(TransactionBufferORM).where(
            TransactionBufferORM.tenant_id == tenant_id,
            TransactionBufferORM.status == BufferStatus.BATCHED,
        )
    )
    batched = list(result.scalars().all())
    assert len(batched) == 50


@pytest.mark.asyncio
async def test_batch_groups_by_corridor(db_session):
    """Separate corridors produce separate jobs with correct base currency."""
    tenant_id = "00000000-0000-0000-0001-000000000001"
    ingest_repo = IngestRepository(db_session)
    await ingest_repo.buffer_transactions(
        tenant_id,
        [
            {"storage_key": "proofs/usd.png", "corridor": "USD/MYR"},
            {"storage_key": "proofs/eur.png", "corridor": "EUR/MYR"},
        ],
    )
    buffered = await ingest_repo.get_buffered_by_tenant(tenant_id)

    from datetime import date
    from decimal import Decimal

    from app.models.schemas import BankEntry, BankStatement
    from app.repositories.bank_account_repository import BankAccountRepository
    from app.repositories.bank_ledger_repository import BankLedgerRepository
    from app.repositories.job_repository import JobRepository

    account_repo = BankAccountRepository(db_session, tenant_id=tenant_id)
    acc = await account_repo.create(
        name="Multi",
        bank_name="Maybank",
        account_number_masked="****2222",
        currency="MYR",
    )
    ledger = BankLedgerRepository(db_session, tenant_id=tenant_id)
    stmt = BankStatement(
        base_currency="MYR",
        entries=[BankEntry(value_date=date(2026, 5, 1), amount=Decimal("50"), currency="MYR")],
    )
    await ledger.create_statement(
        filename="ledger.csv",
        storage_key=None,
        base_currency="MYR",
        statement=stmt,
        account_id=acc.id,
    )

    job_ids = await _create_batch_jobs(
        db_session,
        tenant_id=tenant_id,
        buffered=buffered,
        bank_account_id=acc.id,
        batch_size_threshold=50,
    )
    assert len(job_ids) == 2

    job_repo = JobRepository(db_session, tenant_id=tenant_id)
    currencies = set()
    for jid in job_ids:
        job = await job_repo.get(jid)
        currencies.add(job.base_currency)
    assert currencies == {"MYR"}
