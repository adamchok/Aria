"""Vendor rules (AI feedback) CRUD — tenant-scoped."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.middleware import require_tenant
from app.models.schemas import VendorRuleResponse, VendorRuleUpdateRequest
from app.repositories.vendor_rules_repository import VendorRulesRepository

router = APIRouter()


def _orm_to_schema(rule) -> VendorRuleResponse:
    return VendorRuleResponse(
        id=UUID(rule.id),
        payee_pattern=rule.payee_pattern,
        field_name=rule.field_name,
        corrected_value=rule.corrected_value,
        original_value=rule.original_value,
        source_job_id=rule.source_job_id,
        source_note=rule.source_note,
        applied_count=rule.applied_count,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


@router.get("", response_model=list[VendorRuleResponse])
async def list_vendor_rules(
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> list[VendorRuleResponse]:
    repo = VendorRulesRepository(session, tenant_id=tenant_id)
    rules = await repo.list_for_tenant()
    return [_orm_to_schema(r) for r in rules]


@router.put("/{rule_id}", response_model=VendorRuleResponse)
async def update_vendor_rule(
    rule_id: UUID,
    payload: VendorRuleUpdateRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> VendorRuleResponse:
    repo = VendorRulesRepository(session, tenant_id=tenant_id)
    updated = await repo.update_rule(
        str(rule_id),
        corrected_value=payload.corrected_value,
        source_note=payload.source_note,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Vendor rule {rule_id} not found")
    return _orm_to_schema(updated)


@router.delete("/{rule_id}", status_code=204)
async def delete_vendor_rule(
    rule_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> None:
    repo = VendorRulesRepository(session, tenant_id=tenant_id)
    deleted = await repo.delete_rule(str(rule_id))
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Vendor rule {rule_id} not found")
