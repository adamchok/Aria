"""Vendor learning — per-payee field corrections persisted from human review."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.database import VendorRuleORM

logger = get_logger(__name__)

SUPPORTED_FIELDS = frozenset({"currency", "payee", "reference"})

_LEGAL_SUFFIXES = re.compile(
    r"\b(pte\.?\s*ltd\.?|ltd\.?|inc\.?|p\.?b\.?c\.?|llc\.?|corp\.?|\bco\.?)\b",
    re.IGNORECASE,
)


def normalize_payee(payee: str) -> str:
    """Normalize vendor name: lowercase, strip punctuation and legal suffixes.

    'MOONSHOT AI PTE. LTD.' → 'moonshot ai'
    'Anthropic, PBC'        → 'anthropic'
    """
    cleaned = _LEGAL_SUFFIXES.sub(" ", payee.lower())
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    return " ".join(cleaned.split())


class VendorRulesRepository:
    def __init__(self, session: AsyncSession, tenant_id: str | None = None):
        self._session = session
        self._tenant_id = tenant_id

    async def upsert_rule(
        self,
        *,
        payee_pattern: str,
        field_name: str,
        corrected_value: str,
        original_value: str | None = None,
        source_job_id: str | None = None,
        source_note: str | None = None,
    ) -> VendorRuleORM:
        if field_name not in SUPPORTED_FIELDS:
            raise ValueError(f"Unsupported field for vendor rule: {field_name!r}")

        pattern = normalize_payee(payee_pattern)
        now = datetime.utcnow()

        stmt = select(VendorRuleORM).where(
            VendorRuleORM.tenant_id == self._tenant_id,
            VendorRuleORM.payee_pattern == pattern,
            VendorRuleORM.field_name == field_name,
        )
        result = await self._session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.corrected_value = corrected_value
            existing.source_job_id = source_job_id or existing.source_job_id
            existing.source_note = source_note or existing.source_note
            existing.updated_at = now
            logger.info(
                "vendor_rule.updated",
                payee=pattern,
                field=field_name,
                value=corrected_value,
            )
            return existing

        rule = VendorRuleORM(
            id=str(uuid4()),
            tenant_id=self._tenant_id,
            payee_pattern=pattern,
            field_name=field_name,
            corrected_value=corrected_value,
            original_value=original_value,
            source_job_id=source_job_id,
            source_note=source_note,
            applied_count=0,
            created_at=now,
            updated_at=now,
        )
        self._session.add(rule)
        logger.info(
            "vendor_rule.created",
            payee=pattern,
            field=field_name,
            value=corrected_value,
        )
        return rule

    async def find_for_tenant(self) -> list[dict[str, Any]]:
        """Return all rules as plain dicts — safe to pass across thread boundaries."""
        stmt = select(VendorRuleORM).where(VendorRuleORM.tenant_id == self._tenant_id)
        result = await self._session.execute(stmt)
        return [
            {
                "payee_pattern": r.payee_pattern,
                "field_name": r.field_name,
                "corrected_value": r.corrected_value,
            }
            for r in result.scalars().all()
        ]

    async def increment_applied(self, payee_pattern: str, field_name: str) -> None:
        pattern = normalize_payee(payee_pattern)
        stmt = (
            update(VendorRuleORM)
            .where(
                VendorRuleORM.tenant_id == self._tenant_id,
                VendorRuleORM.payee_pattern == pattern,
                VendorRuleORM.field_name == field_name,
            )
            .values(
                applied_count=VendorRuleORM.applied_count + 1,
                updated_at=datetime.utcnow(),
            )
        )
        await self._session.execute(stmt)
