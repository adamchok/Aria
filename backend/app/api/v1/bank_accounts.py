"""Bank account endpoints.

Tenants register named bank accounts (e.g. "Main Operating", "FX Account").
Monthly statements are uploaded to a specific account; the ledger view shows
all entries across statements for that account with match status.
"""

from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.sdk.stages.bank_statement import extract_bank_statement
from app.core.dependencies import get_db_session
from app.core.middleware import require_tenant
from app.graph.state import DocumentInput
from app.models.enums import SourceFormat
from app.models.schemas import (
    BankAccountCreate,
    BankAccountResponse,
    BankStatementSummary,
    BankStatementUploadResponse,
    LedgerEntryItem,
    LedgerEntryUpdate,
    LedgerPageResponse,
)
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.bank_ledger_repository import BankLedgerRepository
from app.services.storage import StorageService
from app.tools.file_parsers import detect_source_format

from decimal import Decimal

router = APIRouter()


def _ledger_item(entry, filename: str) -> LedgerEntryItem:
    return LedgerEntryItem(
        id=UUID(entry.id),
        statement_id=UUID(entry.statement_id),
        statement_filename=filename,
        value_date=entry.value_date,
        amount=Decimal(str(entry.amount)),
        currency=entry.currency,
        description=entry.description or "",
        reference=entry.reference,
        counterparty=entry.counterparty,
        cleared=entry.cleared,
        cleared_by_job_id=UUID(entry.cleared_by_job_id) if entry.cleared_by_job_id else None,
    )


# ─── Account CRUD ─────────────────────────────────────────────────────────────


@router.post("", response_model=BankAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_bank_account(
    payload: BankAccountCreate,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> BankAccountResponse:
    repo = BankAccountRepository(session, tenant_id=tenant_id)
    acc = await repo.create(
        name=payload.name,
        bank_name=payload.bank_name,
        account_number_masked=payload.account_number_masked,
        currency=payload.currency,
    )
    return BankAccountResponse(
        id=UUID(acc.id),
        tenant_id=UUID(acc.tenant_id) if acc.tenant_id else None,
        name=acc.name,
        bank_name=acc.bank_name,
        account_number_masked=acc.account_number_masked,
        currency=acc.currency,
        created_at=acc.created_at,
    )


@router.get("", response_model=list[BankAccountResponse])
async def list_bank_accounts(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> list[BankAccountResponse]:
    repo = BankAccountRepository(session, tenant_id=tenant_id)
    accounts, _total = await repo.list(page=page, page_size=page_size)
    results: list[BankAccountResponse] = []
    for acc in accounts:
        stats = await repo.get_stats(acc.id)
        results.append(
            BankAccountResponse(
                id=UUID(acc.id),
                tenant_id=UUID(acc.tenant_id) if acc.tenant_id else None,
                name=acc.name,
                bank_name=acc.bank_name,
                account_number_masked=acc.account_number_masked,
                currency=acc.currency,
                created_at=acc.created_at,
                **stats,
            )
        )
    return results


@router.get("/{account_id}", response_model=BankAccountResponse)
async def get_bank_account(
    account_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> BankAccountResponse:
    repo = BankAccountRepository(session, tenant_id=tenant_id)
    acc = await repo.get(account_id)
    if acc is None:
        raise HTTPException(status_code=404, detail="Bank account not found")
    stats = await repo.get_stats(acc.id)
    return BankAccountResponse(
        id=UUID(acc.id),
        tenant_id=UUID(acc.tenant_id) if acc.tenant_id else None,
        name=acc.name,
        bank_name=acc.bank_name,
        account_number_masked=acc.account_number_masked,
        currency=acc.currency,
        created_at=acc.created_at,
        **stats,
    )


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bank_account(
    account_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> None:
    repo = BankAccountRepository(session, tenant_id=tenant_id)
    if not await repo.delete(account_id):
        raise HTTPException(status_code=404, detail="Bank account not found")


# ─── Statements per account ───────────────────────────────────────────────────


@router.post(
    "/{account_id}/statements",
    response_model=BankStatementUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_statement_to_account(
    account_id: UUID,
    bank_statement: Annotated[UploadFile, File(description="Bank statement (XLSX, CSV, or PDF)")],
    base_currency: Annotated[str | None, Form()] = None,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> BankStatementUploadResponse:
    acc_repo = BankAccountRepository(session, tenant_id=tenant_id)
    acc = await acc_repo.get(account_id)
    if acc is None:
        raise HTTPException(status_code=404, detail="Bank account not found")

    currency = (base_currency or acc.currency).strip().upper()
    if not currency.isalpha() or len(currency) != 3:
        raise HTTPException(status_code=422, detail="base_currency must be 3-letter ISO 4217")

    fmt = detect_source_format(bank_statement.filename or "statement", bank_statement.content_type)
    if fmt not in {SourceFormat.EXCEL, SourceFormat.CSV, SourceFormat.PDF}:
        raise HTTPException(
            status_code=400,
            detail="Bank statement must be XLSX, CSV, or PDF. Image formats not supported.",
        )

    data = await bank_statement.read()
    filename = bank_statement.filename or "statement"

    doc = DocumentInput(
        storage_key="",
        filename=filename,
        content_type=bank_statement.content_type,
        bytes_data=data,
    )
    try:
        result = await asyncio.to_thread(
            extract_bank_statement,
            doc,
            currency,
        )
        statement = result.statement
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse bank statement: {exc}") from exc

    storage = StorageService()
    storage.ensure_bucket()
    key = storage.put_object(data, filename, content_type=bank_statement.content_type)

    ledger_repo = BankLedgerRepository(session, tenant_id=tenant_id)
    orm = await ledger_repo.create_statement(
        filename=filename,
        storage_key=key,
        base_currency=currency,
        statement=statement,
        account_id=str(account_id),
    )

    return BankStatementUploadResponse(
        id=UUID(orm.id),
        filename=orm.filename,
        entry_count=orm.entry_count,
        account_id=account_id,
        statement_period_start=statement.statement_period_start,
        statement_period_end=statement.statement_period_end,
    )


@router.get("/{account_id}/statements", response_model=list[BankStatementSummary])
async def list_account_statements(
    account_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> list[BankStatementSummary]:
    acc_repo = BankAccountRepository(session, tenant_id=tenant_id)
    if await acc_repo.get(account_id) is None:
        raise HTTPException(status_code=404, detail="Bank account not found")

    stmts, _total = await acc_repo.list_statements(account_id, page=page, page_size=page_size)
    ledger_repo = BankLedgerRepository(session, tenant_id=tenant_id)
    results: list[BankStatementSummary] = []
    for s in stmts:
        uncleared = await ledger_repo.count_uncleared(s.id)
        results.append(
            BankStatementSummary(
                id=UUID(s.id),
                tenant_id=UUID(s.tenant_id) if s.tenant_id else None,
                filename=s.filename,
                base_currency=s.base_currency,
                statement_period_start=s.statement_period_start,
                statement_period_end=s.statement_period_end,
                entry_count=s.entry_count,
                uncleared_count=uncleared,
                created_at=s.created_at,
            )
        )
    return results


@router.delete(
    "/{account_id}/statements/{statement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_account_statement(
    account_id: UUID,
    statement_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> None:
    acc_repo = BankAccountRepository(session, tenant_id=tenant_id)
    if await acc_repo.get(account_id) is None:
        raise HTTPException(status_code=404, detail="Bank account not found")

    ledger_repo = BankLedgerRepository(session, tenant_id=tenant_id)
    stmt = await ledger_repo.get_statement_for_account(statement_id, account_id)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Bank statement not found")

    deleted = await ledger_repo.delete_statement(statement_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Bank statement not found")


# ─── Ledger view ──────────────────────────────────────────────────────────────


@router.get("/{account_id}/ledger", response_model=LedgerPageResponse)
async def get_account_ledger(
    account_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
    cleared: bool | None = Query(default=None, description="Filter by cleared status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> LedgerPageResponse:
    repo = BankAccountRepository(session, tenant_id=tenant_id)
    if await repo.get(account_id) is None:
        raise HTTPException(status_code=404, detail="Bank account not found")

    items, total = await repo.get_ledger(
        account_id, cleared=cleared, page=page, page_size=page_size
    )
    return LedgerPageResponse(items=items, total=total, page=page, page_size=page_size)


@router.patch("/{account_id}/ledger/{entry_id}", response_model=LedgerEntryItem)
async def update_ledger_entry(
    account_id: UUID,
    entry_id: UUID,
    payload: LedgerEntryUpdate,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> LedgerEntryItem:
    acc_repo = BankAccountRepository(session, tenant_id=tenant_id)
    if await acc_repo.get(account_id) is None:
        raise HTTPException(status_code=404, detail="Bank account not found")

    ledger_repo = BankLedgerRepository(session, tenant_id=tenant_id)
    row = await ledger_repo.get_entry_for_account(entry_id, account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Ledger entry not found")

    entry, stmt = row
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        updated = await ledger_repo.update_entry(entry.id, **updates)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    assert updated is not None
    return _ledger_item(updated, stmt.filename)


@router.delete(
    "/{account_id}/ledger/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_ledger_entry(
    account_id: UUID,
    entry_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> None:
    acc_repo = BankAccountRepository(session, tenant_id=tenant_id)
    if await acc_repo.get(account_id) is None:
        raise HTTPException(status_code=404, detail="Bank account not found")

    ledger_repo = BankLedgerRepository(session, tenant_id=tenant_id)
    row = await ledger_repo.get_entry_for_account(entry_id, account_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Ledger entry not found")

    try:
        deleted = await ledger_repo.delete_entry(entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="Ledger entry not found")
