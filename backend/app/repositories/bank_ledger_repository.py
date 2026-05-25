"""Persistence for the bank statement ledger."""

from __future__ import annotations

import hashlib
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import func, insert as sa_insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import BankEntryORM, BankStatementORM
from app.models.schemas import BankEntry, BankStatement, LedgerEntryItem


class DuplicateStatementError(Exception):
    """Raised when the same file has already been uploaded for this account."""


def _entry_content_hash(account_id: str | None, entry: BankEntry) -> str:
    """Stable SHA-256 fingerprint for a bank entry scoped to its account.

    Excludes description (noisy across export formats); reference + amount +
    date + currency + counterparty is sufficient for collision resistance.
    """
    parts = "|".join([
        account_id or "",
        str(entry.value_date),
        f"{entry.amount:.6f}",
        entry.currency.upper(),
        entry.reference or "",
        entry.counterparty or "",
    ])
    return hashlib.sha256(parts.encode()).hexdigest()


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
        account_id: str | None = None,
        file_hash: str | None = None,
    ) -> tuple[BankStatementORM, int]:
        """Create a statement and its entries, skipping duplicate entries.

        Returns (orm, skipped_count).  Raises DuplicateStatementError when
        file_hash matches an existing upload for the same account.
        """
        # Option C: reject exact file re-uploads before any DB writes.
        if file_hash and account_id:
            existing = (await self._s.execute(
                select(BankStatementORM).where(
                    BankStatementORM.account_id == account_id,
                    BankStatementORM.file_hash == file_hash,
                )
            )).scalar_one_or_none()
            if existing is not None:
                raise DuplicateStatementError(
                    f"File already uploaded as statement '{existing.filename}' "
                    f"(id={existing.id})."
                )

        stmt_id = str(uuid4())
        orm = BankStatementORM(
            id=stmt_id,
            tenant_id=self._tenant_id,
            account_id=account_id,
            filename=filename,
            storage_key=storage_key,
            base_currency=base_currency,
            statement_period_start=statement.statement_period_start,
            statement_period_end=statement.statement_period_end,
            entry_count=0,  # updated below after counting actual inserts
            created_at=datetime.utcnow(),
            file_hash=file_hash,
        )
        self._s.add(orm)
        await self._s.flush()

        skipped = 0
        if statement.entries:
            # Option B: pre-check existing content_hashes, bulk-insert only new rows.
            # Works on SQLite (tests) and PostgreSQL (production) without dialect-specific
            # syntax. The unique index on content_hash still protects against races in prod.
            all_hashes = {
                _entry_content_hash(account_id, entry): entry
                for entry in statement.entries
            }
            existing_hashes: set[str] = set(
                (
                    await self._s.execute(
                        select(BankEntryORM.content_hash).where(
                            BankEntryORM.content_hash.in_(list(all_hashes.keys()))
                        )
                    )
                ).scalars().all()
            )
            new_entries = [
                entry for h, entry in all_hashes.items() if h not in existing_hashes
            ]
            skipped = len(statement.entries) - len(new_entries)

            if new_entries:
                await self._s.execute(
                    sa_insert(BankEntryORM),
                    [
                        {
                            "id": str(entry.id),
                            "statement_id": stmt_id,
                            "tenant_id": self._tenant_id,
                            "value_date": entry.value_date,
                            "amount": entry.amount,
                            "currency": entry.currency,
                            "description": entry.description,
                            "reference": entry.reference,
                            "counterparty": entry.counterparty,
                            "raw_row": entry.raw_row,
                            "cleared": False,
                            "content_hash": _entry_content_hash(account_id, entry),
                        }
                        for entry in new_entries
                    ],
                )
            orm.entry_count = len(new_entries)
        else:
            orm.entry_count = 0

        await self._s.commit()
        await self._s.refresh(orm)
        return orm, skipped

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

    async def get_account_uncleared_as_bank_statement(
        self, account_id: UUID | str, base_currency: str
    ) -> BankStatement:
        """Aggregate all uncleared entries across every statement for a bank account."""
        q = (
            select(BankEntryORM)
            .join(BankStatementORM, BankEntryORM.statement_id == BankStatementORM.id)
            .where(
                BankStatementORM.account_id == str(account_id),
                BankEntryORM.cleared.is_(False),
            )
            .order_by(BankEntryORM.value_date)
        )
        if self._tenant_id is not None:
            q = q.where(BankEntryORM.tenant_id == self._tenant_id)
        entries_orm = list((await self._s.execute(q)).scalars().all())
        period_start = min((e.value_date for e in entries_orm), default=None)
        period_end = max((e.value_date for e in entries_orm), default=None)
        return BankStatement(
            base_currency=base_currency,
            statement_period_start=period_start,
            statement_period_end=period_end,
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

    async def get_entry(self, entry_id: UUID | str) -> BankEntryORM | None:
        q = select(BankEntryORM).where(BankEntryORM.id == str(entry_id))
        if self._tenant_id is not None:
            q = q.where(BankEntryORM.tenant_id == self._tenant_id)
        return (await self._s.execute(q)).scalar_one_or_none()

    async def get_entry_for_account(
        self, entry_id: UUID | str, account_id: UUID | str
    ) -> tuple[BankEntryORM, BankStatementORM] | None:
        q = (
            select(BankEntryORM, BankStatementORM)
            .join(BankStatementORM, BankEntryORM.statement_id == BankStatementORM.id)
            .where(
                BankEntryORM.id == str(entry_id),
                BankStatementORM.account_id == str(account_id),
            )
        )
        if self._tenant_id is not None:
            q = q.where(BankEntryORM.tenant_id == self._tenant_id)
        row = (await self._s.execute(q)).first()
        if row is None:
            return None
        return row[0], row[1]

    async def get_statement_for_account(
        self, statement_id: UUID | str, account_id: UUID | str
    ) -> BankStatementORM | None:
        q = select(BankStatementORM).where(
            BankStatementORM.id == str(statement_id),
            BankStatementORM.account_id == str(account_id),
        )
        if self._tenant_id is not None:
            q = q.where(BankStatementORM.tenant_id == self._tenant_id)
        return (await self._s.execute(q)).scalar_one_or_none()

    async def update_entry(
        self,
        entry_id: UUID | str,
        *,
        value_date=None,
        amount: Decimal | None = None,
        currency: str | None = None,
        description: str | None = None,
        reference: str | None = None,
        counterparty: str | None = None,
    ) -> BankEntryORM | None:
        entry = await self.get_entry(entry_id)
        if entry is None:
            return None
        if entry.cleared:
            raise ValueError("Cannot edit a cleared ledger entry")
        if value_date is not None:
            entry.value_date = value_date
        if amount is not None:
            entry.amount = amount
        if currency is not None:
            entry.currency = currency
        if description is not None:
            entry.description = description
        if reference is not None:
            entry.reference = reference or None
        if counterparty is not None:
            entry.counterparty = counterparty or None
        await self._s.commit()
        await self._s.refresh(entry)
        return entry

    async def delete_entry(self, entry_id: UUID | str) -> bool:
        entry = await self.get_entry(entry_id)
        if entry is None:
            return False
        if entry.cleared:
            raise ValueError("Cannot delete a cleared ledger entry")
        stmt = await self.get_statement(entry.statement_id)
        await self._s.delete(entry)
        if stmt is not None and stmt.entry_count > 0:
            stmt.entry_count -= 1
        await self._s.commit()
        return True

    async def delete_statement(self, statement_id: UUID | str) -> BankStatementORM | None:
        stmt = await self.get_statement(statement_id)
        if stmt is None:
            return None
        storage_key = stmt.storage_key
        await self._s.delete(stmt)
        await self._s.commit()
        stmt.storage_key = storage_key
        return stmt

    _MANUAL_STATEMENT_FILENAME = "Manual Entries"

    async def _get_or_create_manual_statement(
        self, account_id: UUID | str, base_currency: str
    ) -> BankStatementORM:
        """Return (or lazily create) the per-account sentinel statement for manual entries."""
        q = select(BankStatementORM).where(
            BankStatementORM.account_id == str(account_id),
            BankStatementORM.filename == self._MANUAL_STATEMENT_FILENAME,
            BankStatementORM.storage_key.is_(None),
        )
        if self._tenant_id:
            q = q.where(BankStatementORM.tenant_id == self._tenant_id)
        stmt = (await self._s.execute(q)).scalar_one_or_none()
        if stmt is None:
            stmt = BankStatementORM(
                id=str(uuid4()),
                tenant_id=self._tenant_id,
                account_id=str(account_id),
                filename=self._MANUAL_STATEMENT_FILENAME,
                storage_key=None,
                base_currency=base_currency,
                entry_count=0,
            )
            self._s.add(stmt)
            await self._s.flush()
        return stmt

    async def create_entry(
        self,
        account_id: UUID | str,
        *,
        value_date,
        amount: Decimal,
        currency: str,
        description: str = "",
        reference: str | None = None,
        counterparty: str | None = None,
    ) -> tuple[BankEntryORM, BankStatementORM]:
        """Create a single manual ledger entry (no uploaded file)."""
        stmt = await self._get_or_create_manual_statement(account_id, currency)
        entry = BankEntryORM(
            id=str(uuid4()),
            statement_id=stmt.id,
            tenant_id=self._tenant_id,
            value_date=value_date,
            amount=amount,
            currency=currency,
            description=description,
            reference=reference,
            counterparty=counterparty,
            raw_row={},
            cleared=False,
        )
        self._s.add(entry)
        stmt.entry_count += 1
        await self._s.commit()
        await self._s.refresh(entry)
        await self._s.refresh(stmt)
        return entry, stmt

    async def create_entries(
        self,
        account_id: UUID | str,
        entries: list[dict],
        base_currency: str,
    ) -> tuple[list[BankEntryORM], BankStatementORM]:
        """Bulk-create manual ledger entries. Each dict follows LedgerEntryCreate fields."""
        stmt = await self._get_or_create_manual_statement(account_id, base_currency)
        created: list[BankEntryORM] = []
        for e in entries:
            orm = BankEntryORM(
                id=str(uuid4()),
                statement_id=stmt.id,
                tenant_id=self._tenant_id,
                value_date=e["value_date"],
                amount=Decimal(str(e["amount"])),
                currency=e["currency"],
                description=e.get("description", ""),
                reference=e.get("reference"),
                counterparty=e.get("counterparty"),
                raw_row={},
                cleared=False,
            )
            self._s.add(orm)
            created.append(orm)
        stmt.entry_count += len(created)
        await self._s.commit()
        for orm in created:
            await self._s.refresh(orm)
        await self._s.refresh(stmt)
        return created, stmt

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
