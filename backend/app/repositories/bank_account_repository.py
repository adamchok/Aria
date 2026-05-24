"""Persistence for bank accounts and cross-account ledger queries."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import BankAccountORM, BankEntryORM, BankStatementORM
from app.models.schemas import LedgerEntryItem


class BankAccountRepository:
    def __init__(self, session: AsyncSession, tenant_id: str | None = None) -> None:
        self._s = session
        self._tenant_id = tenant_id

    # ─── CRUD ────────────────────────────────────────────────────────────────

    async def create(
        self,
        *,
        name: str,
        bank_name: str,
        account_number_masked: str,
        currency: str,
    ) -> BankAccountORM:
        acc = BankAccountORM(
            id=str(uuid4()),
            tenant_id=self._tenant_id,
            name=name,
            bank_name=bank_name,
            account_number_masked=account_number_masked,
            currency=currency,
            created_at=datetime.utcnow(),
        )
        self._s.add(acc)
        await self._s.commit()
        await self._s.refresh(acc)
        return acc

    async def get(self, account_id: UUID | str) -> BankAccountORM | None:
        q = select(BankAccountORM).where(BankAccountORM.id == str(account_id))
        if self._tenant_id is not None:
            q = q.where(BankAccountORM.tenant_id == self._tenant_id)
        return (await self._s.execute(q)).scalar_one_or_none()

    async def list(
        self, *, page: int = 1, page_size: int = 20
    ) -> tuple[list[BankAccountORM], int]:
        q = select(BankAccountORM)
        if self._tenant_id is not None:
            q = q.where(BankAccountORM.tenant_id == self._tenant_id)
        count = (await self._s.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        q = q.order_by(BankAccountORM.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        rows = (await self._s.execute(q)).scalars().all()
        return list(rows), count

    async def delete(self, account_id: UUID | str) -> bool:
        acc = await self.get(account_id)
        if acc is None:
            return False
        await self._s.delete(acc)
        await self._s.commit()
        return True

    # ─── Statement management ─────────────────────────────────────────────────

    async def list_statements(
        self, account_id: UUID | str, *, page: int = 1, page_size: int = 50
    ) -> tuple[list[BankStatementORM], int]:
        q = select(BankStatementORM).where(BankStatementORM.account_id == str(account_id))
        if self._tenant_id is not None:
            q = q.where(BankStatementORM.tenant_id == self._tenant_id)
        count = (await self._s.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
        q = q.order_by(BankStatementORM.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        rows = (await self._s.execute(q)).scalars().all()
        return list(rows), count

    # ─── Stats ───────────────────────────────────────────────────────────────

    async def get_stats(self, account_id: UUID | str) -> dict:
        """Return statement_count, entry_count, uncleared_count for one account."""
        stmt_q = select(func.count()).where(BankStatementORM.account_id == str(account_id))
        entry_q = (
            select(func.count())
            .select_from(BankEntryORM)
            .join(BankStatementORM, BankEntryORM.statement_id == BankStatementORM.id)
            .where(BankStatementORM.account_id == str(account_id))
        )
        uncleared_q = entry_q.where(BankEntryORM.cleared.is_(False))
        if self._tenant_id is not None:
            stmt_q = stmt_q.where(BankStatementORM.tenant_id == self._tenant_id)
            entry_q = entry_q.where(BankEntryORM.tenant_id == self._tenant_id)
            uncleared_q = uncleared_q.where(BankEntryORM.tenant_id == self._tenant_id)
        return {
            "statement_count": (await self._s.execute(stmt_q)).scalar_one(),
            "entry_count": (await self._s.execute(entry_q)).scalar_one(),
            "uncleared_count": (await self._s.execute(uncleared_q)).scalar_one(),
        }

    # ─── Ledger view ─────────────────────────────────────────────────────────

    async def get_ledger(
        self,
        account_id: UUID | str,
        *,
        cleared: bool | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[LedgerEntryItem], int]:
        """Return paginated ledger entries (entries from all statements for an account)."""
        base = (
            select(BankEntryORM, BankStatementORM.filename)
            .join(BankStatementORM, BankEntryORM.statement_id == BankStatementORM.id)
            .where(BankStatementORM.account_id == str(account_id))
        )
        if self._tenant_id is not None:
            base = base.where(BankEntryORM.tenant_id == self._tenant_id)
        if cleared is not None:
            base = base.where(BankEntryORM.cleared == cleared)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await self._s.execute(count_q)).scalar_one()

        paged = base.order_by(BankEntryORM.value_date.desc()).offset((page - 1) * page_size).limit(page_size)
        rows = (await self._s.execute(paged)).all()

        items = [
            LedgerEntryItem(
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
            for entry, filename in rows
        ]
        return items, total
