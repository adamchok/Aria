"""Reconciliation schedule CRUD endpoints."""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.middleware import require_tenant
from app.models.database import ReconciliationScheduleORM
from app.models.schemas import ReconciliationScheduleCreate, ReconciliationScheduleResponse
from app.repositories.bank_account_repository import BankAccountRepository

router = APIRouter()


def _to_response(s: ReconciliationScheduleORM) -> ReconciliationScheduleResponse:
    return ReconciliationScheduleResponse(
        id=s.id,
        tenant_id=s.tenant_id,
        run_time_utc=s.run_time_utc,
        days_of_week=s.days_of_week,
        bank_account_id=s.bank_account_id,
        base_currency=s.base_currency,
        enabled=s.enabled,
        created_at=s.created_at,
    )


@router.get("", response_model=list[ReconciliationScheduleResponse])
async def list_schedules(
    tenant_id: str = Depends(require_tenant),
    session: AsyncSession = Depends(get_db_session),
) -> list[ReconciliationScheduleResponse]:
    result = await session.execute(
        select(ReconciliationScheduleORM).where(
            ReconciliationScheduleORM.tenant_id == tenant_id
        )
    )
    return [_to_response(s) for s in result.scalars().all()]


@router.post("", response_model=ReconciliationScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ReconciliationScheduleCreate,
    tenant_id: str = Depends(require_tenant),
    session: AsyncSession = Depends(get_db_session),
) -> ReconciliationScheduleResponse:
    account_repo = BankAccountRepository(session, tenant_id=tenant_id)
    if await account_repo.get(body.bank_account_id) is None:
        raise HTTPException(
            status_code=404,
            detail="bank_account_id not found or does not belong to this tenant.",
        )

    schedule = ReconciliationScheduleORM(
        id=str(uuid4()),
        tenant_id=tenant_id,
        run_time_utc=body.run_time_utc,
        days_of_week=body.days_of_week,
        bank_account_id=str(body.bank_account_id),
        base_currency=body.base_currency,
        enabled=body.enabled,
    )
    session.add(schedule)
    await session.commit()
    await session.refresh(schedule)
    return _to_response(schedule)


@router.put("/{schedule_id}", response_model=ReconciliationScheduleResponse)
async def update_schedule(
    schedule_id: str,
    body: ReconciliationScheduleCreate,
    tenant_id: str = Depends(require_tenant),
    session: AsyncSession = Depends(get_db_session),
) -> ReconciliationScheduleResponse:
    result = await session.execute(
        select(ReconciliationScheduleORM).where(
            ReconciliationScheduleORM.id == schedule_id,
            ReconciliationScheduleORM.tenant_id == tenant_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if str(body.bank_account_id) != schedule.bank_account_id:
        account_repo = BankAccountRepository(session, tenant_id=tenant_id)
        if await account_repo.get(body.bank_account_id) is None:
            raise HTTPException(
                status_code=404,
                detail="bank_account_id not found or does not belong to this tenant.",
            )

    schedule.run_time_utc = body.run_time_utc
    schedule.days_of_week = body.days_of_week
    schedule.bank_account_id = str(body.bank_account_id)
    schedule.base_currency = body.base_currency.upper()
    schedule.enabled = body.enabled
    await session.commit()
    await session.refresh(schedule)
    return _to_response(schedule)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: str,
    tenant_id: str = Depends(require_tenant),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    result = await session.execute(
        select(ReconciliationScheduleORM).where(
            ReconciliationScheduleORM.id == schedule_id,
            ReconciliationScheduleORM.tenant_id == tenant_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")

    await session.delete(schedule)
    await session.commit()
