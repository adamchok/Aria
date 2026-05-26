"""Human review action endpoint — confirm / reject / manual_match."""

from __future__ import annotations

import re
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.exceptions import MatchNotFoundError
from app.core.logging import get_logger
from app.core.middleware import require_tenant
from app.models.enums import JobStatus, MatchStatus, ReviewAction
from app.models.schemas import BankEntry, MatchResult, PaymentRecord, ReviewActionRequest, ReviewActionResponse
from app.repositories.bank_ledger_repository import BankLedgerRepository
from app.repositories.job_repository import JobRepository
from app.repositories.vendor_rules_repository import VendorRulesRepository, normalize_payee
from app.services.job_bank_entries import (
    clear_ledger_entry_for_review_match,
    resolve_manual_match_bank_entry,
)
from app.services.report_hydration import hydrate_report

logger = get_logger(__name__)

router = APIRouter()


@router.post(
    "/{job_id}/review/{match_id}",
    response_model=ReviewActionResponse,
)
async def submit_review_action(
    job_id: UUID,
    match_id: UUID,
    payload: ReviewActionRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> ReviewActionResponse:
    repo = JobRepository(session, tenant_id=tenant_id)
    try:
        match = await repo.get_match(job_id, match_id)
    except MatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Idempotency: a confirm/reject on an already-reviewed match returns the
    # current state instead of erroring.
    if match.human_reviewed and payload.action != ReviewAction.MANUAL_MATCH:
        existing = match.payload or {}
        bank_entry = existing.get("bank_entry")
        return ReviewActionResponse(
            match_id=UUID(match.id),
            status=MatchStatus(match.status),
            human_reviewed=True,
            note=match.review_notes,
            bank_entry=BankEntry.model_validate(bank_entry) if bank_entry else None,
        )

    if payload.action == ReviewAction.CONFIRM:
        new_status = MatchStatus.MATCHED
        bank_entry_payload = None
        amount_variance_myr = None
        confirmed_result = MatchResult.model_validate(dict(match.payload or {}))
        if confirmed_result.bank_entry is not None:
            corrections = await _save_vendor_correction(
                session=session,
                tenant_id=tenant_id,
                job_id=str(job_id),
                payment=confirmed_result.normalised_record.payment,
                bank_entry=confirmed_result.bank_entry,
                note=payload.note,
            )
            if corrections:
                await _propagate_vendor_rules_to_siblings(
                    session=session,
                    job_id=job_id,
                    current_match_id=match_id,
                    payee=confirmed_result.normalised_record.payment.payee,
                    corrections=corrections,
                    repo=repo,
                )
    elif payload.action == ReviewAction.REJECT:
        new_status = MatchStatus.UNMATCHED
        bank_entry_payload = None
        amount_variance_myr = None
    elif payload.action == ReviewAction.MANUAL_MATCH:
        if payload.bank_entry_id is None:
            raise HTTPException(
                status_code=400,
                detail="manual_match requires bank_entry_id",
            )
        new_status = MatchStatus.MATCHED
        job = await repo.get(job_id)
        ledger = BankLedgerRepository(session, tenant_id=tenant_id)
        try:
            resolved = await resolve_manual_match_bank_entry(
                job, payload.bank_entry_id, repo, ledger
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        bank_entry_payload = resolved.model_dump(mode="json")
        match_payload = dict(match.payload or {})
        nr = MatchResult.model_validate(match_payload).normalised_record
        amount_variance_myr = (
            abs(resolved.amount) - nr.amount_myr_at_settlement_rate
        ).quantize(Decimal("0.01"))

        corrections = await _save_vendor_correction(
            session=session,
            tenant_id=tenant_id,
            job_id=str(job_id),
            payment=nr.payment,
            bank_entry=resolved,
            note=payload.note,
        )
        if corrections:
            await _propagate_vendor_rules_to_siblings(
                session=session,
                job_id=job_id,
                current_match_id=match_id,
                payee=nr.payment.payee,
                corrections=corrections,
                repo=repo,
            )

    updated = await repo.update_match(
        job_id,
        match_id,
        status=new_status,
        human_reviewed=True,
        review_notes=payload.note,
        bank_entry_payload=bank_entry_payload,
        amount_variance_myr=amount_variance_myr,
    )

    response_bank_entry: BankEntry | None = None
    if updated.payload and updated.payload.get("bank_entry"):
        response_bank_entry = BankEntry.model_validate(updated.payload["bank_entry"])

    if new_status == MatchStatus.MATCHED:
        entry_id_to_clear: UUID | None = None
        if payload.action == ReviewAction.MANUAL_MATCH and response_bank_entry is not None:
            entry_id_to_clear = response_bank_entry.id
        elif payload.action == ReviewAction.CONFIRM:
            confirmed = MatchResult.model_validate(dict(match.payload or {}))
            if confirmed.bank_entry is not None:
                entry_id_to_clear = confirmed.bank_entry.id
        if entry_id_to_clear is not None:
            job_for_ledger = await repo.get(job_id)
            ledger_repo = BankLedgerRepository(session, tenant_id=tenant_id)
            cleared = await clear_ledger_entry_for_review_match(
                job_for_ledger,
                entry_id_to_clear,
                job_id,
                ledger_repo,
            )
            if cleared:
                logger.info(
                    "review.ledger_cleared",
                    job_id=str(job_id),
                    entry_id=str(entry_id_to_clear),
                    count=cleared,
                )

    job = await repo.get(job_id)
    if job.report_blob:
        hydrated = await hydrate_report(repo, job)
        await repo.save_report(job_id, hydrated.model_dump(mode="json"))

    remaining_uncertain = await repo.list_matches(job_id, status=MatchStatus.UNCERTAIN)
    if not remaining_uncertain and job.status == JobStatus.AWAITING_REVIEW:
        await repo.update_status(job_id, status=JobStatus.COMPLETED)

    return ReviewActionResponse(
        match_id=UUID(updated.id),
        status=MatchStatus(updated.status),
        human_reviewed=True,
        note=updated.review_notes,
        bank_entry=response_bank_entry,
    )


async def _save_vendor_correction(
    *,
    session: AsyncSession,
    tenant_id: str,
    job_id: str,
    payment: object,
    bank_entry: BankEntry,
    note: str | None,
) -> list[tuple[str, str]]:
    """Detect field discrepancies and persist vendor rules for future jobs.

    Returns list of (field_name, corrected_value) for each rule saved.
    """
    saved: list[tuple[str, str]] = []
    if not isinstance(payment, PaymentRecord):
        return saved

    detected = _detect_currency_from_description(bank_entry.description, payment.amount_original)
    if detected and detected != payment.currency:
        try:
            rules = VendorRulesRepository(session, tenant_id=tenant_id)
            await rules.upsert_rule(
                payee_pattern=payment.payee,
                field_name="currency",
                corrected_value=detected,
                original_value=payment.currency,
                source_job_id=job_id,
                source_note=note,
            )
            saved.append(("currency", detected))
        except Exception:
            logger.exception(
                "vendor_rule.save_failed",
                payee=payment.payee,
                field="currency",
            )
    return saved


async def _propagate_vendor_rules_to_siblings(
    *,
    session: AsyncSession,
    job_id: UUID,
    current_match_id: UUID,
    payee: str,
    corrections: list[tuple[str, str]],
    repo: JobRepository,
) -> int:
    """Flag sibling UNCERTAIN matches with the same payee so reviewers see the correction context."""
    payee_norm = normalize_payee(payee)
    siblings = await repo.list_matches(job_id, status=MatchStatus.UNCERTAIN)
    count = 0
    for sibling in siblings:
        if str(sibling.id) == str(current_match_id):
            continue
        sib_payload = dict(sibling.payload or {})
        try:
            sib_result = MatchResult.model_validate(sib_payload)
        except Exception:
            continue
        sib_payment = sib_result.normalised_record.payment
        sib_norm = normalize_payee(sib_payment.payee)
        if payee_norm not in sib_norm and sib_norm not in payee_norm:
            continue
        applicable = [
            f"{field}: {getattr(sib_payment, field, '?')!r} → {value!r}"
            for field, value in corrections
            if str(getattr(sib_payment, field, None) or "") != value
        ]
        if not applicable:
            continue
        sib_payload["vendor_rule_note"] = "Peer review correction: " + "; ".join(applicable) + "."
        sibling.payload = sib_payload
        count += 1
    if count:
        logger.info(
            "vendor_rule.siblings_flagged",
            job_id=str(job_id),
            payee=payee_norm,
            count=count,
        )
    return count


def _detect_currency_from_description(description: str, amount: Decimal) -> str | None:
    """Parse embedded currency+amount from POS debit descriptions.

    'POS DEBIT MOONSHOT AI SINGAPO (USD 5.00)' → 'USD'
    """
    text = (description or "").upper()
    amount_str = str(amount.quantize(Decimal("0.01")))
    patterns = [amount_str]
    if amount == amount.to_integral_value():
        patterns.append(str(int(amount)))
    for amt in patterns:
        m = re.search(rf"([A-Z]{{3}})\s*{re.escape(amt)}(?!\d)", text)
        if m:
            return m.group(1)
    return None
