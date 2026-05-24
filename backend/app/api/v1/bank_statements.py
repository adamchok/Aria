"""Bank statement ledger endpoints.

Tenants upload bank statements once and reuse them across multiple reconciliation
jobs. Entries are marked ``cleared`` when a job matches against them, giving a
persistent audit trail of what has been reconciled.
"""

from __future__ import annotations

import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.ingestion import IngestionAgent
from app.core.dependencies import get_db_session
from app.core.middleware import require_tenant
from app.graph.state import DocumentInput
from app.models.enums import SourceFormat
from app.models.schemas import (
    BankEntryItem,
    BankStatementDetail,
    BankStatementSummary,
    BankStatementUploadResponse,
)
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.bank_ledger_repository import BankLedgerRepository
from app.services.storage import StorageService
from app.tools.file_parsers import detect_source_format

router = APIRouter()


def _validate_currency(code: str) -> str:
    """Reject clearly invalid currency codes early."""
    upper = code.strip().upper()
    if not upper.isalpha() or len(upper) != 3:
        raise HTTPException(
            status_code=422,
            detail=f"base_currency must be a 3-letter ISO 4217 code (e.g. MYR), got: {code!r}",
        )
    return upper


@router.post("", response_model=BankStatementUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_bank_statement(
    bank_statement: Annotated[UploadFile, File(description="Bank statement (XLSX, CSV, or PDF)")],
    base_currency: Annotated[str, Form()] = "MYR",
    account_id: Annotated[
        str | None,
        Form(description="Optional bank account ID to link this statement to its ledger."),
    ] = None,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> BankStatementUploadResponse:
    validated_currency = _validate_currency(base_currency)

    # Validate account_id ownership before parsing (fast fail).
    resolved_account_id: str | None = None
    if account_id:
        try:
            acc_uuid = UUID(account_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"account_id is not a valid UUID: {account_id!r}") from exc
        acc_repo = BankAccountRepository(session, tenant_id=tenant_id)
        if await acc_repo.get(acc_uuid) is None:
            raise HTTPException(status_code=404, detail="Bank account not found")
        resolved_account_id = str(acc_uuid)

    fmt = detect_source_format(bank_statement.filename or "statement", bank_statement.content_type)
    if fmt not in {SourceFormat.EXCEL, SourceFormat.CSV, SourceFormat.PDF}:
        raise HTTPException(
            status_code=400,
            detail="Bank statement must be XLSX, CSV, or PDF. Image formats not supported.",
        )

    data = await bank_statement.read()
    filename = bank_statement.filename or "statement"

    agent = IngestionAgent()
    doc = DocumentInput(
        storage_key="",
        filename=filename,
        content_type=bank_statement.content_type,
        bytes_data=data,
    )
    # Run in a thread — pdfplumber + optional LLM call are blocking operations.
    try:
        parsed = await asyncio.to_thread(agent._parse_bank_statement, doc, validated_currency)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse bank statement: {exc}") from exc

    storage = StorageService()
    storage.ensure_bucket()
    key = storage.put_object(data, filename, content_type=bank_statement.content_type)

    repo = BankLedgerRepository(session, tenant_id=tenant_id)
    orm = await repo.create_statement(
        filename=filename,
        storage_key=key,
        base_currency=validated_currency,
        statement=parsed,
        account_id=resolved_account_id,
    )

    return BankStatementUploadResponse(
        id=UUID(orm.id),
        filename=orm.filename,
        entry_count=orm.entry_count,
        statement_period_start=parsed.statement_period_start,
        statement_period_end=parsed.statement_period_end,
    )


@router.get("", response_model=list[BankStatementSummary])
async def list_bank_statements(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> list[BankStatementSummary]:
    repo = BankLedgerRepository(session, tenant_id=tenant_id)
    stmts, _total = await repo.list_statements(page=page, page_size=page_size)
    results: list[BankStatementSummary] = []
    for s in stmts:
        uncleared = await repo.count_uncleared(s.id)
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


@router.get("/{statement_id}", response_model=BankStatementDetail)
async def get_bank_statement(
    statement_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> BankStatementDetail:
    repo = BankLedgerRepository(session, tenant_id=tenant_id)
    stmt = await repo.get_statement(statement_id)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Bank statement not found")

    entries_orm = await repo.get_entries(statement_id)
    uncleared = sum(1 for e in entries_orm if not e.cleared)

    return BankStatementDetail(
        id=UUID(stmt.id),
        tenant_id=UUID(stmt.tenant_id) if stmt.tenant_id else None,
        filename=stmt.filename,
        base_currency=stmt.base_currency,
        statement_period_start=stmt.statement_period_start,
        statement_period_end=stmt.statement_period_end,
        entry_count=stmt.entry_count,
        uncleared_count=uncleared,
        created_at=stmt.created_at,
        entries=[
            BankEntryItem(
                id=UUID(e.id),
                value_date=e.value_date,
                amount=e.amount,
                currency=e.currency,
                description=e.description or "",
                reference=e.reference,
                counterparty=e.counterparty,
                cleared=e.cleared,
            )
            for e in entries_orm
        ],
    )


@router.get("/{statement_id}/entries", response_model=list[BankEntryItem])
async def list_bank_entries(
    statement_id: UUID,
    cleared: bool | None = Query(default=None, description="Filter by cleared status"),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> list[BankEntryItem]:
    repo = BankLedgerRepository(session, tenant_id=tenant_id)
    stmt = await repo.get_statement(statement_id)
    if stmt is None:
        raise HTTPException(status_code=404, detail="Bank statement not found")

    entries_orm = await repo.get_entries(statement_id, cleared=cleared)
    return [
        BankEntryItem(
            id=UUID(e.id),
            value_date=e.value_date,
            amount=e.amount,
            currency=e.currency,
            description=e.description or "",
            reference=e.reference,
            counterparty=e.counterparty,
            cleared=e.cleared,
        )
        for e in entries_orm
    ]
