"""Integration tests for /api/v1/schedules."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models.schemas import BankEntry, BankStatement
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.bank_ledger_repository import BankLedgerRepository
from tests.conftest import TEST_TENANT_ID


async def _seed_account(db_session) -> str:
    account_repo = BankAccountRepository(db_session, tenant_id=TEST_TENANT_ID)
    acc = await account_repo.create(
        name="Schedule Account",
        bank_name="Maybank",
        account_number_masked="****3333",
        currency="MYR",
    )
    ledger = BankLedgerRepository(db_session, tenant_id=TEST_TENANT_ID)
    stmt = BankStatement(
        base_currency="MYR",
        entries=[BankEntry(value_date=date(2026, 5, 1), amount=Decimal("10"), currency="MYR")],
    )
    await ledger.create_statement(
        filename="ledger.csv",
        storage_key=None,
        base_currency="MYR",
        statement=stmt,
        account_id=acc.id,
    )
    return acc.id


@pytest.mark.asyncio
async def test_create_list_update_delete_schedule(api_client, db_session):
    account_id = await _seed_account(db_session)
    create = await api_client.post(
        "/api/v1/schedules",
        json={
            "run_time_utc": "09:00",
            "days_of_week": [0, 1, 2, 3, 4],
            "bank_account_id": account_id,
            "base_currency": "MYR",
            "enabled": True,
        },
    )
    assert create.status_code == 201, create.text
    schedule_id = create.json()["id"]

    listed = await api_client.get("/api/v1/schedules")
    assert listed.status_code == 200
    assert any(s["id"] == schedule_id for s in listed.json())

    other_account = await _seed_account(db_session)
    update = await api_client.put(
        f"/api/v1/schedules/{schedule_id}",
        json={
            "run_time_utc": "10:30",
            "days_of_week": [1, 3],
            "bank_account_id": other_account,
            "base_currency": "USD",
            "enabled": False,
        },
    )
    assert update.status_code == 200, update.text
    body = update.json()
    assert body["run_time_utc"] == "10:30"
    assert body["bank_account_id"] == other_account
    assert body["base_currency"] == "USD"
    assert body["enabled"] is False

    delete = await api_client.delete(f"/api/v1/schedules/{schedule_id}")
    assert delete.status_code == 204


@pytest.mark.asyncio
async def test_create_schedule_rejects_unknown_bank_account(api_client):
    resp = await api_client.post(
        "/api/v1/schedules",
        json={
            "run_time_utc": "09:00",
            "days_of_week": [0],
            "bank_account_id": str(uuid4()),
            "base_currency": "MYR",
        },
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_schedule_tenant_isolation(api_client, db_session):
    other_repo = BankAccountRepository(db_session, tenant_id="other-tenant")
    other_acc = await other_repo.create(
        name="Other",
        bank_name="HSBC",
        account_number_masked="****0000",
        currency="USD",
    )

    resp = await api_client.post(
        "/api/v1/schedules",
        json={
            "run_time_utc": "09:00",
            "days_of_week": [0],
            "bank_account_id": other_acc.id,
            "base_currency": "MYR",
        },
    )
    assert resp.status_code == 404
