"""Unit tests for BankLedgerRepository — tenant isolation and core operations."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.models.schemas import BankEntry, BankStatement
from app.repositories.bank_ledger_repository import BankLedgerRepository
from tests.conftest import TEST_TENANT_ID

TENANT_A = TEST_TENANT_ID
TENANT_B = "00000000-0000-0000-0002-000000000002"


def _stmt(entries: int = 2) -> BankStatement:
    return BankStatement(
        base_currency="MYR",
        statement_period_start=date(2026, 5, 1),
        statement_period_end=date(2026, 5, 31),
        entries=[
            BankEntry(
                value_date=date(2026, 5, i + 1),
                amount=Decimal(f"{(i + 1) * 100}.00"),
                currency="MYR",
                description=f"Entry {i}",
                reference=f"REF-{i:03d}",
            )
            for i in range(entries)
        ],
    )


# ─── create_statement ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_statement_persists_entries(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo.create_statement(
        filename="may.csv", storage_key=None, base_currency="MYR", statement=_stmt(3)
    )
    assert orm.entry_count == 3
    assert orm.tenant_id == TENANT_A

    entries = await repo.get_entries(orm.id)
    assert len(entries) == 3
    assert all(not e.cleared for e in entries)
    assert all(e.tenant_id == TENANT_A for e in entries)


@pytest.mark.asyncio
async def test_create_statement_without_entries(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo.create_statement(
        filename="empty.csv", storage_key=None, base_currency="MYR", statement=_stmt(0)
    )
    assert orm.entry_count == 0
    entries = await repo.get_entries(orm.id)
    assert entries == []


# ─── get_statement ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_statement_returns_own_tenant(db_session):
    repo_a = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo_a.create_statement(
        filename="a.csv", storage_key=None, base_currency="MYR", statement=_stmt(1)
    )
    result = await repo_a.get_statement(orm.id)
    assert result is not None
    assert result.id == orm.id


@pytest.mark.asyncio
async def test_get_statement_returns_none_for_other_tenant(db_session):
    repo_a = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo_a.create_statement(
        filename="a.csv", storage_key=None, base_currency="MYR", statement=_stmt(1)
    )
    # Tenant B cannot see Tenant A's statement.
    repo_b = BankLedgerRepository(db_session, tenant_id=TENANT_B)
    result = await repo_b.get_statement(orm.id)
    assert result is None


@pytest.mark.asyncio
async def test_get_statement_without_tenant_filter_returns_any(db_session):
    repo_a = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo_a.create_statement(
        filename="a.csv", storage_key=None, base_currency="MYR", statement=_stmt(1)
    )
    # No tenant filter — admin-style access.
    repo_unscoped = BankLedgerRepository(db_session, tenant_id=None)
    result = await repo_unscoped.get_statement(orm.id)
    assert result is not None


# ─── get_entries ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_entries_filters_cleared(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo.create_statement(
        filename="m.csv", storage_key=None, base_currency="MYR", statement=_stmt(4)
    )
    entries = await repo.get_entries(orm.id)
    first_id = UUID(entries[0].id)
    await repo.clear_entries([first_id], job_id=uuid4())

    cleared = await repo.get_entries(orm.id, cleared=True)
    uncleared = await repo.get_entries(orm.id, cleared=False)
    assert len(cleared) == 1
    assert len(uncleared) == 3


@pytest.mark.asyncio
async def test_get_entries_tenant_defense_in_depth(db_session):
    """get_entries filters by tenant even though statement_id is unique."""
    repo_a = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo_a.create_statement(
        filename="a.csv", storage_key=None, base_currency="MYR", statement=_stmt(2)
    )
    # Cross-tenant get_entries should return empty list.
    repo_b = BankLedgerRepository(db_session, tenant_id=TENANT_B)
    entries = await repo_b.get_entries(orm.id)
    assert entries == []


# ─── get_account_uncleared_as_bank_statement ─────────────────────────────────

@pytest.mark.asyncio
async def test_get_account_uncleared_aggregates_across_statements(db_session):
    from app.repositories.bank_account_repository import BankAccountRepository

    account_repo = BankAccountRepository(db_session, tenant_id=TENANT_A)
    acc = await account_repo.create(
        name="Main",
        bank_name="Maybank",
        account_number_masked="****1234",
        currency="MYR",
    )
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    await repo.create_statement(
        filename="may.csv",
        storage_key=None,
        base_currency="MYR",
        statement=_stmt(2),
        account_id=acc.id,
    )
    stmt2 = await repo.create_statement(
        filename="jun.csv",
        storage_key=None,
        base_currency="MYR",
        statement=_stmt(1),
        account_id=acc.id,
    )
    entries = await repo.get_entries(stmt2.id)
    await repo.clear_entries([UUID(entries[0].id)], job_id=uuid4())

    result = await repo.get_account_uncleared_as_bank_statement(acc.id, "MYR")
    assert len(result.entries) == 2
    assert result.statement_period_start == date(2026, 5, 1)
    assert result.statement_period_end == date(2026, 5, 2)


# ─── get_uncleared_as_bank_statement ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_uncleared_as_bank_statement_raises_for_missing(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    with pytest.raises(ValueError, match="not found"):
        await repo.get_uncleared_as_bank_statement(uuid4(), "MYR")


@pytest.mark.asyncio
async def test_get_uncleared_as_bank_statement_excludes_cleared(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo.create_statement(
        filename="m.csv", storage_key=None, base_currency="MYR", statement=_stmt(3)
    )
    entries = await repo.get_entries(orm.id)
    await repo.clear_entries([UUID(entries[0].id)], job_id=uuid4())

    result = await repo.get_uncleared_as_bank_statement(orm.id, "MYR")
    assert len(result.entries) == 2
    assert result.base_currency == "MYR"


@pytest.mark.asyncio
async def test_get_uncleared_raises_for_other_tenant(db_session):
    repo_a = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo_a.create_statement(
        filename="a.csv", storage_key=None, base_currency="MYR", statement=_stmt(1)
    )
    repo_b = BankLedgerRepository(db_session, tenant_id=TENANT_B)
    with pytest.raises(ValueError):
        await repo_b.get_uncleared_as_bank_statement(orm.id, "MYR")


# ─── count_uncleared ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_count_uncleared(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo.create_statement(
        filename="c.csv", storage_key=None, base_currency="MYR", statement=_stmt(5)
    )
    assert await repo.count_uncleared(orm.id) == 5
    entries = await repo.get_entries(orm.id)
    await repo.clear_entries([UUID(e.id) for e in entries[:2]], job_id=uuid4())
    assert await repo.count_uncleared(orm.id) == 3


# ─── clear_entries ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_clear_entries_marks_correct_entries(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo.create_statement(
        filename="cl.csv", storage_key=None, base_currency="MYR", statement=_stmt(3)
    )
    entries = await repo.get_entries(orm.id)
    ids_to_clear = [UUID(entries[0].id), UUID(entries[1].id)]
    job_id = uuid4()

    count = await repo.clear_entries(ids_to_clear, job_id=job_id)
    assert count == 2

    cleared = await repo.get_entries(orm.id, cleared=True)
    assert len(cleared) == 2
    assert all(e.cleared_by_job_id == str(job_id) for e in cleared)


@pytest.mark.asyncio
async def test_clear_entries_does_not_cross_tenant(db_session):
    """Entries belonging to Tenant A cannot be cleared by Tenant B's repo."""
    repo_a = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    orm = await repo_a.create_statement(
        filename="a.csv", storage_key=None, base_currency="MYR", statement=_stmt(2)
    )
    entries_a = await repo_a.get_entries(orm.id)
    ids = [UUID(e.id) for e in entries_a]

    repo_b = BankLedgerRepository(db_session, tenant_id=TENANT_B)
    cleared = await repo_b.clear_entries(ids, job_id=uuid4())
    assert cleared == 0  # cross-tenant clear returns 0


@pytest.mark.asyncio
async def test_clear_entries_empty_list_is_noop(db_session):
    repo = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    count = await repo.clear_entries([], job_id=uuid4())
    assert count == 0


# ─── list_statements ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_statements_tenant_isolation(db_session):
    repo_a = BankLedgerRepository(db_session, tenant_id=TENANT_A)
    repo_b = BankLedgerRepository(db_session, tenant_id=TENANT_B)

    for i in range(2):
        await repo_a.create_statement(
            filename=f"a_{i}.csv", storage_key=None, base_currency="MYR", statement=_stmt(1)
        )
    await repo_b.create_statement(
        filename="b.csv", storage_key=None, base_currency="MYR", statement=_stmt(1)
    )

    stmts_a, total_a = await repo_a.list_statements()
    stmts_b, total_b = await repo_b.list_statements()

    assert total_a == 2
    assert total_b == 1
    assert all(s.tenant_id == TENANT_A for s in stmts_a)
    assert all(s.tenant_id == TENANT_B for s in stmts_b)
