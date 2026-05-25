"""Matching stage — filters, scoring, LLM reasoning."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

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

# SWIFT / wire transfer weights
_W_AMOUNT = 0.4
_W_DATE = 0.2
_W_REF = 0.3
_W_PAYER = 0.1

# Card / POS weights — bank assigns internal codes (T61763), never invoice refs;
# amount precision and merchant name carry almost all evidential weight.
_W_AMOUNT_CARD = 0.55
_W_DATE_CARD = 0.25
_W_REF_CARD = 0.05
_W_PAYER_CARD = 0.15

_RE_POS = re.compile(r"^POS\s+(DEBIT|CREDIT)\b", re.IGNORECASE)


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
        stage1 = _stage1_date_filter(nr, statement.entries, used_entries, settings)
        candidates = _stage2_amount_filter(nr, stage1)
        if not candidates:
            # Amount filter may fail when LLM extracted wrong currency (e.g. SGD vs
            # USD for a Singapore SaaS company). Rescue entries whose description
            # embeds the payment's original amount (POS debit format: "USD5.00").
            candidates = _description_rescue(nr, stage1, candidates)

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

    variance = (abs(top_entry.amount) - nr.amount_myr_at_settlement_rate).quantize(Decimal("0.01"))

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
    # Bank debits are stored as negative; compare absolute value.
    return [e for e in entries if lo <= abs(e.amount) <= hi]


def _description_rescue(
    nr: NormalisedRecord,
    stage1_candidates: list[BankEntry],
    existing_candidates: list[BankEntry],
) -> list[BankEntry]:
    """Rescue date-filtered entries whose description embeds the payment amount.

    POS debit descriptions encode the original foreign currency+amount
    (e.g. 'ANTHROPIC SAN FRA (USD 20.00)' or 'MOONSHOT AI SINGAPO USD5.00').
    This catches cases where the extracted currency is wrong (SGD vs USD for
    Singapore SaaS) or the FX rate used differs from the card settlement rate.
    """
    already = {str(e.id) for e in existing_candidates}
    amount = nr.payment.amount_original
    amount_str = str(amount.quantize(Decimal("0.01")))  # "5.00"
    targets = {amount_str}
    if amount == amount.to_integral_value():
        targets.add(str(int(amount)))  # "5"

    rescued = []
    for entry in stage1_candidates:
        if str(entry.id) in already:
            continue
        text = f"{entry.description or ''} {entry.reference or ''}".upper()
        for amt in targets:
            # Match ISO currency code adjacent to the amount: "USD5.00", "USD 5.00"
            if re.search(rf"[A-Z]{{3}}\s*{re.escape(amt)}(?!\d)", text):
                rescued.append(entry)
                break
    return rescued


def _score(nr: NormalisedRecord, entry: BankEntry, settings) -> CandidateScore:
    target_amount = nr.amount_myr_at_settlement_rate
    entry_amount_abs = abs(entry.amount)
    within_band = nr.tolerance_low <= entry_amount_abs <= nr.tolerance_high

    if within_band:
        # The tolerance band is asymmetric (card-network markup pushes tolerance_high
        # well above settlement rate). Score 1.0 at settlement rate, floor 0.5 at band
        # edges — guarantees in-band entries never score 0 regardless of which half
        # of the band they fall in.
        dist_from_settlement = abs(entry_amount_abs - target_amount)
        max_dist_in_band = max(
            nr.tolerance_high - target_amount,
            target_amount - nr.tolerance_low,
        )
        if max_dist_in_band == 0:
            amount_score = 1.0
        else:
            amount_score = max(0.5, 1.0 - 0.5 * float(dist_from_settlement / max_dist_in_band))
    else:
        # Outside band: decay from the nearest band edge (not from settlement rate).
        spread_half = max(
            (nr.tolerance_high - nr.tolerance_low) / Decimal("2"),
            target_amount * Decimal("0.025"),
        )
        if spread_half == 0:
            amount_score = 1.0 if entry_amount_abs == target_amount else 0.0
        else:
            dist = min(
                abs(entry_amount_abs - nr.tolerance_low),
                abs(entry_amount_abs - nr.tolerance_high),
            )
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

    # Card/POS transactions use internal bank references (T61763), never invoice numbers.
    # Detect from either side: receipt has card-stated amount, or bank description is POS.
    is_card = nr.payment.amount_charged_local is not None or bool(
        entry.description and _RE_POS.match(entry.description)
    )
    if is_card:
        w_amount, w_date, w_ref, w_payer = _W_AMOUNT_CARD, _W_DATE_CARD, _W_REF_CARD, _W_PAYER_CARD
    else:
        w_amount, w_date, w_ref, w_payer = _W_AMOUNT, _W_DATE, _W_REF, _W_PAYER

    composite = (
        w_amount * amount_score
        + w_date * date_score
        + w_ref * ref_score
        + w_payer * party_score
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
