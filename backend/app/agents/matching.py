"""Agent 3 — Matching.

Three-stage pipeline:
  1. Date-window filter (±DATE_WINDOW_DAYS)
  2. Amount-tolerance filter ([tolerance_low, tolerance_high])
  3. Composite scoring + LLM reasoning per top candidate

Composite weights (from CLAUDE.md): amount 0.4, date 0.2, reference 0.3,
payer name 0.1. Status routing:
  >= 0.75      MATCHED
  0.5 .. 0.75  UNCERTAIN -> review queue
  < 0.5        UNMATCHED -> exception
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from decimal import Decimal

from rapidfuzz import fuzz

from app.agents.audit import make_audit_entry
from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.graph.state import ReconciliationState
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import (
    BankEntry,
    BankStatement,
    CandidateScore,
    MatchResult,
    NormalisedRecord,
)
from app.services.embeddings import similarity
from app.services.llm_client import LLMClient

logger = get_logger(__name__)

_W_AMOUNT = 0.4
_W_DATE = 0.2
_W_REF = 0.3
_W_PAYER = 0.1


class MatchingAgent:
    def __init__(
        self,
        llm: LLMClient | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._llm = llm or LLMClient()
        self._settings = settings or get_settings()

    def __call__(self, state: ReconciliationState) -> ReconciliationState:
        return self.run(state)

    def run(self, state: ReconciliationState) -> ReconciliationState:
        state.status = JobStatus.MATCHING
        statement = state.bank_statement
        used_entries: set[str] = set()
        results: list[MatchResult] = []

        for nr in state.normalised_records:
            result = self._match_one(nr, statement, used_entries, state.job_id)
            results.append(result)
            if result.bank_entry is not None and result.status == MatchStatus.MATCHED:
                used_entries.add(str(result.bank_entry.id))
            state.audit_log.append(
                make_audit_entry(
                    job_id=state.job_id,
                    agent="matching",
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

        state.match_results = results
        state.agents_completed.append("matching")
        logger.info(
            "matching.complete",
            matched=sum(1 for r in results if r.status == MatchStatus.MATCHED),
            uncertain=sum(1 for r in results if r.status == MatchStatus.UNCERTAIN),
            unmatched=sum(1 for r in results if r.status == MatchStatus.UNMATCHED),
        )
        return state

    # ── stages ────────────────────────────────────────────────────────────

    def _match_one(
        self,
        nr: NormalisedRecord,
        statement: BankStatement | None,
        used_entries: set[str],
        job_id,
    ) -> MatchResult:
        candidates: list[BankEntry] = []
        if statement:
            candidates = self._stage1_date_filter(nr, statement.entries, used_entries)
            candidates = self._stage2_amount_filter(nr, candidates)

        scored: list[tuple[BankEntry, CandidateScore]] = []
        for entry in candidates:
            score = self._score(nr, entry)
            scored.append((entry, score))

        # Sort by composite descending; LLM reasons over the top candidate.
        scored.sort(key=lambda x: x[1].composite, reverse=True)

        if not scored:
            llm_response = self._llm.reason_match(
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
        llm_response = self._llm.reason_match(
            normalised=_serialise_normalised(nr),
            candidate=_serialise_entry(top_entry),
            candidate_scores=top_score.model_dump(),
        )

        status_str = llm_response.get("status", "UNCERTAIN")
        status = MatchStatus(status_str) if status_str in MatchStatus.__members__ else MatchStatus.UNCERTAIN
        confidence = max(0.0, min(1.0, float(llm_response.get("confidence", top_score.composite))))

        # Hard-enforce thresholds — LLM output is advisory but bounded.
        if confidence >= self._settings.match_confidence_threshold:
            status = MatchStatus.MATCHED
        elif confidence >= self._settings.match_review_floor:
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

    def _stage1_date_filter(
        self, nr: NormalisedRecord, entries: list[BankEntry], used: set[str]
    ) -> list[BankEntry]:
        window = self._settings.date_window_days
        target = nr.payment.value_date
        return [
            e
            for e in entries
            if str(e.id) not in used
            and abs((e.value_date - target).days) <= window
        ]

    def _stage2_amount_filter(
        self, nr: NormalisedRecord, entries: list[BankEntry]
    ) -> list[BankEntry]:
        # Allow slight slack beyond the strict tolerance window so the LLM can
        # still reason about near-misses (the threshold then catches them).
        slack = Decimal("0.005") * nr.amount_myr_at_settlement_rate
        lo = nr.tolerance_low - slack
        hi = nr.tolerance_high + slack
        return [e for e in entries if lo <= e.amount <= hi]

    def _score(self, nr: NormalisedRecord, entry: BankEntry) -> CandidateScore:
        # Amount score: anchor on settlement-rate MYR (card debits sit near this).
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

        # Date score: 1.0 same day, decays over window.
        delta = abs((entry.value_date - nr.payment.value_date).days)
        date_score = max(0.0, 1.0 - delta / max(self._settings.date_window_days, 1))

        # Reference similarity — strong signal when present.
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

        # Match payer (inbound) or payee (outbound card/vendor debits) against bank text.
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
    """Return 1.0 when a bank line mentions the payment's original currency amount."""
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
    """Score payer/payee against bank counterparty or description."""
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
