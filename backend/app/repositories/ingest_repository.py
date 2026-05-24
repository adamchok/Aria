"""Persistence for the transaction ingestion buffer."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import TransactionBufferORM
from app.models.enums import BufferStatus


class IngestRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def buffer_transactions(
        self, tenant_id: UUID | str, items: list[dict[str, Any]]
    ) -> list[TransactionBufferORM]:
        records = [
            TransactionBufferORM(
                tenant_id=str(tenant_id),
                payload=item,
                corridor=item.get("corridor", "UNKNOWN").upper(),
            )
            for item in items
        ]
        self._s.add_all(records)
        await self._s.commit()
        return records

    async def get_buffered_by_tenant(self, tenant_id: UUID | str) -> list[TransactionBufferORM]:
        result = await self._s.execute(
            select(TransactionBufferORM).where(
                TransactionBufferORM.tenant_id == str(tenant_id),
                TransactionBufferORM.status == BufferStatus.BUFFERED,
            ).order_by(TransactionBufferORM.received_at)
        )
        return list(result.scalars().all())

    async def get_all_tenant_ids_with_buffer(self) -> list[str]:
        result = await self._s.execute(
            select(TransactionBufferORM.tenant_id)
            .where(TransactionBufferORM.status == BufferStatus.BUFFERED)
            .distinct()
        )
        return [row[0] for row in result.all()]

    async def mark_batched(self, record_ids: list[str], job_id: str) -> None:
        from sqlalchemy import update
        await self._s.execute(
            update(TransactionBufferORM)
            .where(TransactionBufferORM.id.in_(record_ids))
            .values(status=BufferStatus.BATCHED, job_id=job_id)
        )
        await self._s.commit()

    async def get_queue_summary(self, tenant_id: UUID | str) -> list[dict]:
        """Return per-corridor counts and oldest received_at."""
        result = await self._s.execute(
            select(
                TransactionBufferORM.corridor,
                func.count(TransactionBufferORM.id).label("count"),
                func.min(TransactionBufferORM.received_at).label("oldest"),
            )
            .where(
                TransactionBufferORM.tenant_id == str(tenant_id),
                TransactionBufferORM.status == BufferStatus.BUFFERED,
            )
            .group_by(TransactionBufferORM.corridor)
        )
        return [{"corridor": r.corridor, "count": r.count, "oldest": r.oldest} for r in result.all()]
