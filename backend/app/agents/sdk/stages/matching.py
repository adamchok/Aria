"""Matching stage — filters, scoring, LLM reasoning."""

from __future__ import annotations

import re
from decimal import Decimal

from rapidfuzz import fuzz

from app.agents.audit import make_audit_entry
from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.core.logging import get_logger
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import BankEntry, BankStatement, CandidateScore, MatchResult, NormalisedRecord
from app.services.embeddings import similarity

logger = get_logger(__name__)

AGENT_NAME = "matching"

_W_AMOUNT = 0.4
_W_DATE = 0.2
_W_REF = 0.3
_W_PAYER = 0.1


def run_matching_stage(ctx: ReconciliationContext, llm: LLMService | None = None) -> None:
    ctx.state.status = JobStatus.MATCHING
    llm = llm or LLMService(ctx.settings)
    settings = ctx.settings
    statement = ctx.state.bank_statement
    used_entries: set[str] = set()
    results: list[MatchResult] = []

    for nr in ctx.state.normalised_records:
        result = _match_one(nr, statement, used_entries, llm, settings)
        results.append(result)
        if result.bank_entry is not None and result.status == MatchStatus.MATCHED:
            used_entries.add(str(result.bank_entry.id))
        ctx.state.audit_log.append(
            make_audit_entry(
                job_id=ctx.job_id,
                agent=AGENT_NAME,
                action="match",
                input_snapshot={
                    "amount_original": str(nr.payment.amount_original),
                    "currency": nr.payment.currency,
                    "value_date": nr.payment.value_date.isoformat(),
                    "tolerance_low": str(nr.tolerance_low),
                    "tolerance_high": str(nr.tolerance_high),
                },
                output_snapshot={
                    "status": result.status.value,
                    "confidence": result.confidence,
                    "bank_entry_id": str(result.bank_entry.id) if result.bank_entry else None,
                    "amount_variance_myr": str(result.amount_variance_myr),
                },
                confidence=result.confidence,
                reasoning=result.reasoning_chain,
            )
        )

    ctx.state.match_results = results
    ctx.state.agents_completed.append("matching")
    logger.info(
        "matching.complete",
        matched=sum(1 for r in results if r.status == MatchStatus.MATCHED),
        uncertain=sum(1 for r in results if r.status == MatchStatus.UNCERTAIN),
        unmatched=sum(1 for r in results if r.status == MatchStatus.UNMATCHED),
    )


def _match_one(
    nr: NormalisedRecord,
    statement: BankStatement | None,
    used_entries: set[str],
    llm: LLMService,
    settings,
) -> MatchResult:
    candidates: list[BankEntry] = []
    if statement:
        candidates = _stage1_date_filter(nr, statement.entries, used_entries, settings)
        candidates = _stage2_amount_filter(nr, candidates)

    scored: list[tuple[BankEntry, CandidateScore]] = []
    for entry in candidates:
        score = _score(nr, entry, settings)
        scored.append((entry, score))
    scored.sort(key=lambda x: x[1].composite, reverse=True)

    if not scored:
        llm_response = llm.reason_match(
            normalised=_serialise_normalised(nr),
            candidate=None,
            candidate_scores={"composite": 0.0},
        )
        return MatchResult(
            normalised_record=nr,
            bank_entry=None,
            candidate_scores=[],
            confidence=0.0,
            status=MatchStatus.UNMATCHED,
            amount_variance_myr=Decimal("0"),
            variance_explanation=llm_response.get("variance_explanation", ""),
            reasoning_chain=llm_response.get("reasoning_chain", ""),
        )

    top_entry, top_score = scored[0]
    llm_response = llm.reason_match(
        normalised=_serialise_normalised(nr),
        candidate=_serialise_entry(top_entry),
        candidate_scores=top_score.model_dump(),
    )

    status_str = llm_response.get("status", "UNCERTAIN")
    status = (
        MatchStatus(status_str)
        if status_str in MatchStatus.__members__
        else MatchStatus.UNCERTAIN
    )
    confidence = max(0.0, min(1.0, float(llm_response.get("confidence", top_score.composite))))

    if confidence >= settings.match_confidence_threshold:
        status = MatchStatus.MATCHED
    elif confidence >= settings.match_review_floor:
        status = MatchStatus.UNCERTAIN
    else:
        status = MatchStatus.UNMATCHED

    variance = (top_entry.amount - nr.amount_myr_at_settlement_rate).quantize(Decimal("0.01"))

    return MatchResult(
        normalised_record=nr,
        bank_entry=top_entry if status != MatchStatus.UNMATCHED else None,
        candidate_scores=[s for _, s in scored[:5]],
        confidence=confidence,
        status=status,
        amount_variance_myr=variance,
        variance_explanation=llm_response.get("variance_explanation", ""),
        reasoning_chain=llm_response.get("reasoning_chain", ""),
    )


def _stage1_date_filter(nr, entries, used, settings) -> list[BankEntry]:
    window = settings.date_window_days
    target = nr.payment.value_date
    return [
        e
        for e in entries
        if str(e.id) not in used and abs((e.value_date - target).days) <= window
    ]


def _stage2_amount_filter(nr, entries) -> list[BankEntry]:
    slack = Decimal("0.005") * nr.amount_myr_at_settlement_rate
    lo = nr.tolerance_low - slack
    hi = nr.tolerance_high + slack
    return [e for e in entries if lo <= e.amount <= hi]


def _score(nr: NormalisedRecord, entry: BankEntry, settings) -> CandidateScore:
    target_amount = nr.amount_myr_at_settlement_rate
    spread_half = max(
        (nr.tolerance_high - nr.tolerance_low) / Decimal("2"),
        nr.amount_myr_at_settlement_rate * Decimal("0.025"),
    )
    if spread_half == 0:
        amount_score = 1.0 if entry.amount == target_amount else 0.0
    else:
        dist = abs(entry.amount - target_amount)
        amount_score = max(0.0, 1.0 - float(dist / spread_half))

    delta = abs((entry.value_date - nr.payment.value_date).days)
    date_score = max(0.0, 1.0 - delta / max(settings.date_window_days, 1))

    ref_score = 0.0
    if nr.payment.reference and entry.reference:
        ref_score = fuzz.token_set_ratio(nr.payment.reference, entry.reference) / 100.0
    elif nr.payment.reference and entry.description:
        ref_score = (
            fuzz.partial_ratio(nr.payment.reference.upper(), entry.description.upper()) / 100.0
        )
    ref_score = max(
        ref_score,
        _foreign_amount_in_description(
            nr.payment.currency,
            nr.payment.amount_original,
            f"{entry.description} {entry.reference or ''}",
        ),
    )

    party_score = _party_match_score(nr, entry)
    composite = (
        _W_AMOUNT * amount_score
        + _W_DATE * date_score
        + _W_REF * ref_score
        + _W_PAYER * party_score
    )
    composite = max(0.0, min(1.0, composite))
    return CandidateScore(
        bank_entry_id=entry.id,
        amount_match_score=amount_score,
        date_proximity_score=date_score,
        reference_similarity_score=ref_score,
        payer_name_score=party_score,
        composite=composite,
    )


def _foreign_amount_in_description(currency: str, amount: Decimal, text: str) -> float:
    if not text:
        return 0.0
    cur = re.escape(currency.upper())
    normalized = amount.quantize(Decimal("0.01"))
    variants = {str(normalized), str(normalized.normalize())}
    if normalized == normalized.to_integral_value():
        variants.add(str(int(normalized)))
    haystack = text.upper()
    for amt in variants:
        if re.search(rf"{cur}\s*{re.escape(amt)}", haystack):
            return 1.0
    return 0.0


def _party_match_score(nr: NormalisedRecord, entry: BankEntry) -> float:
    parties = [nr.payment.payer, nr.payment.payee]
    targets = [t for t in (entry.counterparty, entry.description) if t]
    best = 0.0
    for party in parties:
        for target in targets:
            best = max(best, fuzz.token_set_ratio(party, target) / 100.0)
            best = max(best, fuzz.partial_ratio(party.upper(), target.upper()) / 100.0)
            best = max(best, similarity(party, target))
    return best


def _serialise_normalised(nr: NormalisedRecord) -> dict:
    return {
        "payer": nr.payment.payer,
        "amount_original": str(nr.payment.amount_original),
        "currency": nr.payment.currency,
        "value_date": nr.payment.value_date.isoformat(),
        "reference": nr.payment.reference,
        "amount_myr_at_invoice_rate": str(nr.amount_myr_at_invoice_rate),
        "amount_myr_at_settlement_rate": str(nr.amount_myr_at_settlement_rate),
        "tolerance_low": str(nr.tolerance_low),
        "tolerance_high": str(nr.tolerance_high),
        "estimated_charges_myr": str(nr.estimated_charges_myr),
    }


def _serialise_entry(e: BankEntry) -> dict:
    return {
        "id": str(e.id),
        "value_date": e.value_date.isoformat(),
        "amount": str(e.amount),
        "currency": e.currency,
        "description": e.description,
        "reference": e.reference,
        "counterparty": e.counterparty,
    }
