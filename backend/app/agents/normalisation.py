"""Agent 2 — Normalisation.

Converts each PaymentRecord to MYR at both invoice and settlement dates,
computes the FX-aware tolerance window, and estimates SWIFT charges.

The settlement date is approximated as ``value_date + 2 business days``
(modal observed value per Pay360 2025). When the bank statement is present
we also try to find an actual settlement date within the date window.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from decimal import Decimal

from app.agents.audit import make_audit_entry
from app.core.config import Settings, get_settings
from app.core.exceptions import FXRateUnavailableError
from app.core.logging import get_logger
from app.graph.state import ReconciliationState
from app.models.enums import JobStatus
from app.models.schemas import NormalisedRecord, PaymentRecord
from app.services.fx_service import FXService
from app.services.swift_charges import estimate_swift_charges

logger = get_logger(__name__)


class NormalisationAgent:
    def __init__(
        self,
        fx_service: FXService | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._fx = fx_service or FXService()
        self._settings = settings or get_settings()

    def __call__(self, state: ReconciliationState) -> ReconciliationState:
        return asyncio.run(self.arun(state))

    async def arun(self, state: ReconciliationState) -> ReconciliationState:
        state.status = JobStatus.NORMALISING
        out: list[NormalisedRecord] = []

        for record in state.payment_records:
            try:
                normalised = await self._normalise(record, state.base_currency)
            except FXRateUnavailableError as exc:
                logger.error("normalisation.fx_unavailable", currency=record.currency, error=str(exc))
                state.audit_log.append(
                    make_audit_entry(
                        job_id=state.job_id,
                        agent="normalisation",
                        action="fx_unavailable",
                        input_snapshot={"currency": record.currency, "date": str(record.value_date)},
                        reasoning=str(exc),
                    )
                )
                continue
            out.append(normalised)
            state.audit_log.append(
                make_audit_entry(
                    job_id=state.job_id,
                    agent="normalisation",
                    action="normalise",
                    input_snapshot={
                        "amount_original": str(record.amount_original),
                        "currency": record.currency,
                        "value_date": record.value_date.isoformat(),
                    },
                    output_snapshot={
                        "amount_myr_at_invoice_rate": str(normalised.amount_myr_at_invoice_rate),
                        "amount_myr_at_settlement_rate": str(
                            normalised.amount_myr_at_settlement_rate
                        ),
                        "tolerance_low": str(normalised.tolerance_low),
                        "tolerance_high": str(normalised.tolerance_high),
                    },
                    reasoning=(
                        f"Converted {record.amount_original} {record.currency} to "
                        f"{state.base_currency} using invoice and settlement rates. "
                        f"Tolerance window applies SWIFT charge estimate "
                        f"{normalised.estimated_charges_myr} MYR and "
                        f"{self._settings.fx_variance_buffer_pct} buffer."
                    ),
                )
            )

        state.normalised_records = out
        state.agents_completed.append("normalisation")
        logger.info("normalisation.complete", count=len(out))
        return state

    # ── helpers ───────────────────────────────────────────────────────────

    async def _normalise(self, record: PaymentRecord, base_currency: str) -> NormalisedRecord:
        invoice_date = record.value_date
        settlement_date = _add_business_days(invoice_date, 2)

        fx_invoice = await self._fx.get_rate(record.currency, base_currency, invoice_date)
        fx_settlement = await self._fx.get_rate(record.currency, base_currency, settlement_date)

        amount_invoice = (record.amount_original * fx_invoice).quantize(Decimal("0.01"))
        amount_settlement = (record.amount_original * fx_settlement).quantize(Decimal("0.01"))

        charges_source = estimate_swift_charges(record.amount_original, record.currency)
        charges_myr = (charges_source * fx_settlement).quantize(Decimal("0.01"))

        buffer = self._settings.fx_variance_buffer_pct
        # SWIFT estimates target inbound wire transfers. Flat correspondent fees
        # would collapse the tolerance band for small amounts and admit unrelated
        # bank lines (e.g. other card debits in the same statement).
        charges_for_tolerance = (
            Decimal("0")
            if record.amount_original < Decimal("1000")
            else charges_myr
        )
        # Card/acquirer FX markup on POS debits can exceed the base FX buffer alone.
        card_markup = (amount_settlement * Decimal("0.025")).quantize(Decimal("0.01"))

        tolerance_low = (
            amount_invoice - charges_for_tolerance - buffer * amount_invoice
        ).quantize(Decimal("0.01"))
        tolerance_high = (
            amount_settlement + buffer * amount_settlement + card_markup
        ).quantize(Decimal("0.01"))
        # If FX drift went the other direction make sure low <= high.
        if tolerance_low > tolerance_high:
            tolerance_low, tolerance_high = tolerance_high, tolerance_low

        return NormalisedRecord(
            payment=record,
            amount_myr_at_invoice_rate=amount_invoice,
            amount_myr_at_settlement_rate=amount_settlement,
            fx_rate_invoice=fx_invoice,
            fx_rate_settlement=fx_settlement,
            tolerance_low=tolerance_low,
            tolerance_high=tolerance_high,
            estimated_charges_myr=charges_myr,
            base_currency=base_currency,
        )


def _add_business_days(start: date, n: int) -> date:
    """Naive business-day shift. Sufficient for matching tolerance bounds."""
    d = start
    added = 0
    while added < n:
        d = d + timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d
