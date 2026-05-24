"""Persistence operations for jobs, matches, and audit logs."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import JobNotFoundError, MatchNotFoundError
from app.models.database import AuditLogORM, JobORM, MatchORM
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import AuditLogEntry, MatchResult


class JobRepository:
    def __init__(self, session: AsyncSession, tenant_id: str | None = None) -> None:
        self._s = session
        self._tenant_id = tenant_id

    async def create_job(
        self,
        *,
        base_currency: str,
        payment_proof_keys: list[str],
        bank_statement_key: str | None,
        bank_statement_id: str | None = None,
        tenant_id: str | None = None,
    ) -> JobORM:
        job = JobORM(
            status=JobStatus.PENDING,
            base_currency=base_currency,
            payment_proof_keys=payment_proof_keys,
            bank_statement_key=bank_statement_key,
            bank_statement_id=bank_statement_id,
            tenant_id=tenant_id or self._tenant_id,
        )
        self._s.add(job)
        await self._s.commit()
        await self._s.refresh(job)
        return job

    async def get(self, job_id: UUID | str) -> JobORM:
        stmt = select(JobORM).where(JobORM.id == str(job_id))
        if self._tenant_id is not None:
            stmt = stmt.where(JobORM.tenant_id == self._tenant_id)
        result = await self._s.execute(stmt)
        job = result.scalar_one_or_none()
        if job is None:
            raise JobNotFoundError(f"Job {job_id} not found")
        return job

    async def list_jobs(
        self,
        *,
        status: JobStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[JobORM], int]:
        stmt = select(JobORM)
        if self._tenant_id is not None:
            stmt = stmt.where(JobORM.tenant_id == self._tenant_id)
        if status is not None:
            stmt = stmt.where(JobORM.status == status)

        from sqlalchemy import func
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self._s.execute(count_stmt)).scalar_one()

        stmt = stmt.order_by(JobORM.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        result = await self._s.execute(stmt)
        return list(result.scalars().all()), total

    async def update_status(
        self,
        job_id: UUID | str,
        *,
        status: JobStatus,
        progress_pct: float | None = None,
        agents_completed: list[str] | None = None,
        error: str | None = None,
    ) -> JobORM:
        job = await self.get(job_id)
        job.status = status
        if progress_pct is not None:
            job.progress_pct = progress_pct
        if agents_completed is not None:
            job.agents_completed = agents_completed
        if error is not None:
            job.error = error
        job.updated_at = datetime.utcnow()
        await self._s.commit()
        await self._s.refresh(job)
        return job

    async def save_report(self, job_id: UUID | str, report_blob: dict[str, Any]) -> JobORM:
        job = await self.get(job_id)
        job.report_blob = report_blob
        job.updated_at = datetime.utcnow()
        await self._s.commit()
        await self._s.refresh(job)
        return job

    async def replace_matches(self, job_id: UUID | str, matches: list[MatchResult]) -> None:
        # Clear existing, then re-insert. Simple and idempotent.
        existing = await self._s.execute(select(MatchORM).where(MatchORM.job_id == str(job_id)))
        for m in existing.scalars().all():
            await self._s.delete(m)

        for m in matches:
            self._s.add(
                MatchORM(
                    id=str(m.id),
                    job_id=str(job_id),
                    status=m.status,
                    confidence=m.confidence,
                    amount_variance_myr=m.amount_variance_myr,
                    variance_explanation=m.variance_explanation,
                    reasoning_chain=m.reasoning_chain,
                    payload=m.model_dump(mode="json"),
                    human_reviewed=m.human_reviewed,
                    review_notes=m.review_notes,
                )
            )
        await self._s.commit()

    async def get_match(self, job_id: UUID | str, match_id: UUID | str) -> MatchORM:
        result = await self._s.execute(
            select(MatchORM).where(MatchORM.id == str(match_id), MatchORM.job_id == str(job_id))
        )
        match = result.scalar_one_or_none()
        if match is None:
            raise MatchNotFoundError(f"Match {match_id} not found for job {job_id}")
        return match

    async def update_match(
        self,
        job_id: UUID | str,
        match_id: UUID | str,
        *,
        status: MatchStatus,
        human_reviewed: bool = True,
        review_notes: str | None = None,
        bank_entry_payload: dict[str, Any] | None = None,
    ) -> MatchORM:
        match = await self.get_match(job_id, match_id)
        match.status = status
        match.human_reviewed = human_reviewed
        if review_notes is not None:
            match.review_notes = review_notes

        payload = dict(match.payload or {})
        payload["status"] = status.value
        payload["human_reviewed"] = human_reviewed
        if review_notes is not None:
            payload["review_notes"] = review_notes
        if bank_entry_payload is not None:
            payload["bank_entry"] = bank_entry_payload
        match.payload = payload

        match.updated_at = datetime.utcnow()
        await self._s.commit()
        await self._s.refresh(match)
        return match

    async def list_matches(
        self, job_id: UUID | str, *, status: MatchStatus | None = None
    ) -> list[MatchORM]:
        stmt = select(MatchORM).where(MatchORM.job_id == str(job_id))
        if status is not None:
            stmt = stmt.where(MatchORM.status == status)
        result = await self._s.execute(stmt)
        return list(result.scalars().all())

    async def append_audit(self, entries: list[AuditLogEntry]) -> None:
        for entry in entries:
            self._s.add(
                AuditLogORM(
                    id=str(entry.id),
                    job_id=str(entry.job_id),
                    agent=entry.agent,
                    action=entry.action,
                    confidence=entry.confidence,
                    reasoning=entry.reasoning,
                    input_snapshot=entry.input_snapshot,
                    output_snapshot=entry.output_snapshot,
                    timestamp=entry.timestamp,
                )
            )
        await self._s.commit()

    async def list_audit(self, job_id: UUID | str) -> list[AuditLogORM]:
        result = await self._s.execute(
            select(AuditLogORM).where(AuditLogORM.job_id == str(job_id)).order_by(AuditLogORM.timestamp)
        )
        return list(result.scalars().all())
