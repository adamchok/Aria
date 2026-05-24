"""Persistence for the bank statement ledger."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import BankEntryORM, BankStatementORM
from app.models.schemas import BankEntry, BankStatement


class BankLedgerRepository:
    def __init__(self, session: AsyncSession, tenant_id: str | None = None) -> None:
        self._s = session
        self._tenant_id = tenant_id

    async def create_statement(
        self,
        *,
        filename: str,
        storage_key: str | None,
        base_currency: str,
        statement: BankStatement,
    ) -> BankStatementORM:
        stmt_id = str(uuid4())
        orm = BankStatementORM(
            id=stmt_id,
            tenant_id=self._tenant_id,
            filename=filename,
            storage_key=storage_key,
            base_currency=base_currency,
            statement_period_start=statement.statement_period_start,
            statement_period_end=statement.statement_period_end,
            entry_count=len(statement.entries),
            created_at=datetime.utcnow(),
        )
        self._s.add(orm)
        await self._s.flush()

        for entry in statement.entries:
            self._s.add(
                BankEntryORM(
                    id=str(entry.id),
                    statement_id=stmt_id,
                    tenant_id=self._tenant_id,
                    value_date=entry.value_date,
                    amount=entry.amount,
                    currency=entry.currency,
                    description=entry.description,
                    reference=entry.reference,
                    counterparty=entry.counterparty,
                    raw_row=entry.raw_row,
                    cleared=False,
                )
            )

        await self._s.commit()
        await self._s.refresh(orm)
        return orm

    async def get_statement(self, statement_id: UUID | str) -> BankStatementORM | None:
        q = select(BankStatementORM).where(BankStatementORM.id == str(statement_id))
        if self._tenant_id is not None:
            q = q.where(BankStatementORM.tenant_id == self._tenant_id)
        result = await self._s.execute(q)
        return result.scalar_one_or_none()

    async def list_statements(
        self, *, page: int = 1, page_size: int = 20
    ) -> tuple[list[BankStatementORM], int]:
        q = select(BankStatementORM)
        if self._tenant_id is not None:
            q = q.where(BankStatementORM.tenant_id == self._tenant_id)
        count_q = select(func.count()).select_from(q.subquery())
        total = (await self._s.execute(count_q)).scalar_one()
        q = q.order_by(BankStatementORM.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        result = await self._s.execute(q)
        return list(result.scalars().all()), total

    async def get_entries(
        self, statement_id: UUID | str, *, cleared: bool | None = None
    ) -> list[BankEntryORM]:
        q = (
            select(BankEntryORM)
            .where(BankEntryORM.statement_id == str(statement_id))
            .order_by(BankEntryORM.value_date)
        )
        if cleared is not None:
            q = q.where(BankEntryORM.cleared == cleared)
        # Defense-in-depth: also filter by tenant even though statement_id is unique.
        if self._tenant_id is not None:
            q = q.where(BankEntryORM.tenant_id == self._tenant_id)
        result = await self._s.execute(q)
        return list(result.scalars().all())

    async def get_uncleared_as_bank_statement(
        self, statement_id: UUID | str, base_currency: str
    ) -> BankStatement:
        stmt_orm = await self.get_statement(statement_id)
        if stmt_orm is None:
            raise ValueError(
                f"Bank statement {statement_id} not found"
                + (f" for tenant {self._tenant_id}" if self._tenant_id else "")
            )
        entries_orm = await self.get_entries(statement_id, cleared=False)
        return BankStatement(
            base_currency=base_currency,
            statement_period_start=stmt_orm.statement_period_start,
            statement_period_end=stmt_orm.statement_period_end,
            entries=[
                BankEntry(
                    id=UUID(e.id),
                    value_date=e.value_date,
                    amount=Decimal(str(e.amount)),
                    currency=e.currency,
                    description=e.description or "",
                    reference=e.reference,
                    counterparty=e.counterparty,
                    raw_row=e.raw_row or {},
                )
                for e in entries_orm
            ],
        )

    async def count_uncleared(self, statement_id: UUID | str) -> int:
        q = select(func.count()).where(
            BankEntryORM.statement_id == str(statement_id),
            BankEntryORM.cleared.is_(False),
        )
        if self._tenant_id is not None:
            q = q.where(BankEntryORM.tenant_id == self._tenant_id)
        return (await self._s.execute(q)).scalar_one()

    async def clear_entries(self, entry_ids: list[UUID | str], job_id: UUID | str) -> int:
        """Mark entries as cleared by job. Only touches entries belonging to this tenant."""
        if not entry_ids:
            return 0
        str_ids = [str(eid) for eid in entry_ids]
        q = select(BankEntryORM).where(BankEntryORM.id.in_(str_ids))
        # Enforce tenant isolation even when called from the pipeline runner.
        if self._tenant_id is not None:
            q = q.where(BankEntryORM.tenant_id == self._tenant_id)
        result = await self._s.execute(q)
        count = 0
        for entry in result.scalars().all():
            entry.cleared = True
            entry.cleared_by_job_id = str(job_id)
            count += 1
        await self._s.commit()
        return count
