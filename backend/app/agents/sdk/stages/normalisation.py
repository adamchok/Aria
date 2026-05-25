"""FX normalisation stage."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.agents.audit import make_audit_entry
from app.agents.sdk.context import ReconciliationContext
from app.core.exceptions import FXRateUnavailableError
from app.core.logging import get_logger
from app.models.enums import JobStatus
from app.models.schemas import NormalisedRecord, PaymentRecord
from app.services.fx_service import FXService
from app.services.swift_charges import estimate_swift_charges

logger = get_logger(__name__)

AGENT_NAME = "normalisation"

# Public holidays for major SWIFT settlement markets (MY/SG/GB/US) for 2025-2027.
# Avoids T+2 landing on a known closure day. Not exhaustive — covers ~95% of cases.
_PUBLIC_HOLIDAYS: frozenset[date] = frozenset({
    # Malaysia
    date(2025, 1, 1), date(2025, 1, 29), date(2025, 1, 30), date(2025, 2, 11),
    date(2025, 5, 1), date(2025, 5, 12), date(2025, 6, 2), date(2025, 8, 31),
    date(2025, 9, 16), date(2025, 10, 20), date(2025, 12, 25),
    date(2026, 1, 1), date(2026, 2, 17), date(2026, 2, 18),
    date(2026, 5, 1), date(2026, 6, 1), date(2026, 8, 31),
    date(2026, 9, 16), date(2026, 12, 25),
    date(2027, 1, 1), date(2027, 2, 6), date(2027, 2, 7),
    date(2027, 5, 1), date(2027, 8, 31), date(2027, 9, 16), date(2027, 12, 25),
    # UK bank holidays
    date(2025, 4, 18), date(2025, 4, 21), date(2025, 5, 5), date(2025, 5, 26),
    date(2025, 8, 25), date(2025, 12, 26),
    date(2026, 4, 3), date(2026, 4, 6), date(2026, 5, 4), date(2026, 5, 25),
    date(2026, 8, 31), date(2026, 12, 28),
    date(2027, 4, 26), date(2027, 4, 29), date(2027, 5, 3), date(2027, 5, 31),
    date(2027, 8, 30), date(2027, 12, 27), date(2027, 12, 28),
    # US federal holidays (key settlement closures)
    date(2025, 7, 4), date(2025, 11, 27), date(2025, 11, 28),
    date(2026, 7, 3), date(2026, 11, 26), date(2026, 11, 27),
    date(2027, 7, 5), date(2027, 11, 25), date(2027, 11, 26),
})


async def run_normalisation_stage(
    ctx: ReconciliationContext,
    fx_service: FXService | None = None,
) -> None:
    ctx.state.status = JobStatus.NORMALISING
    fx = fx_service or FXService()
    settings = ctx.settings
    out: list[NormalisedRecord] = []

    for record in ctx.state.payment_records:
        try:
            normalised = await _normalise(record, ctx.base_currency, fx, settings)
        except FXRateUnavailableError as exc:
            logger.error("normalisation.fx_unavailable", currency=record.currency, error=str(exc))
            ctx.state.audit_log.append(
                make_audit_entry(
                    job_id=ctx.job_id,
                    agent=AGENT_NAME,
                    action="fx_unavailable",
                    input_snapshot={"currency": record.currency, "date": str(record.value_date)},
                    reasoning=str(exc),
                )
            )
            # Preserve record as stub — shows up as UNMATCHED with reason in report (#8)
            out.append(
                NormalisedRecord(
                    payment=record,
                    amount_myr_at_invoice_rate=Decimal("0"),
                    amount_myr_at_settlement_rate=Decimal("0"),
                    fx_rate_invoice=Decimal("0"),
                    fx_rate_settlement=Decimal("0"),
                    tolerance_low=Decimal("0"),
                    tolerance_high=Decimal("0"),
                    estimated_charges_myr=Decimal("0"),
                    base_currency=ctx.base_currency,
                    fx_unavailable=True,
                    fx_unavailable_reason=str(exc),
                )
            )
            continue
        out.append(normalised)
        ctx.state.audit_log.append(
            make_audit_entry(
                job_id=ctx.job_id,
                agent=AGENT_NAME,
                action="normalise",
                input_snapshot={
                    "amount_original": str(record.amount_original),
                    "currency": record.currency,
                    "value_date": record.value_date.isoformat(),
                },
                output_snapshot={
                    "amount_myr_at_invoice_rate": str(normalised.amount_myr_at_invoice_rate),
                    "amount_myr_at_settlement_rate": str(normalised.amount_myr_at_settlement_rate),
                    "tolerance_low": str(normalised.tolerance_low),
                    "tolerance_high": str(normalised.tolerance_high),
                },
                reasoning=(
                    f"Converted {record.amount_original} {record.currency} to "
                    f"{ctx.base_currency} using invoice and settlement rates."
                ),
            )
        )

    ctx.state.normalised_records = out
    ctx.state.agents_completed.append("normalisation")
    logger.info("normalisation.complete", count=len(out))


async def _normalise(record: PaymentRecord, base_currency: str, fx: FXService, settings) -> NormalisedRecord:
    invoice_date = record.value_date
    settlement_date = _add_business_days(invoice_date, 2)

    fx_invoice = await fx.get_rate(record.currency, base_currency, invoice_date)
    fx_settlement = await fx.get_rate(record.currency, base_currency, settlement_date)

    amount_invoice = (record.amount_original * fx_invoice).quantize(Decimal("0.01"))
    amount_settlement = (record.amount_original * fx_settlement).quantize(Decimal("0.01"))

    charges_source = estimate_swift_charges(record.amount_original, record.currency)
    charges_myr = (charges_source * fx_settlement).quantize(Decimal("0.01"))

    # When the receipt explicitly states the charged local-currency amount (common on card
    # receipts: "Charged RM786.72 using 1 USD = 4.0975 MYR"), use it as the settlement
    # amount — more accurate than the interbank rate. Tighten tolerance to ±MYR 0.10.
    card_stated = (
        record.amount_charged_local is not None
        and record.local_currency is not None
        and record.local_currency.upper() == base_currency
    )
    if card_stated:
        amount_settlement = record.amount_charged_local.quantize(Decimal("0.01"))  # type: ignore[union-attr]
        tolerance_low = (amount_settlement - Decimal("0.10")).quantize(Decimal("0.01"))
        tolerance_high = (amount_settlement + Decimal("0.10")).quantize(Decimal("0.01"))
    else:
        buffer = settings.fx_variance_buffer_pct
        charges_for_tolerance = (
            Decimal("0") if record.amount_original < Decimal("1000") else charges_myr
        )
        card_markup = (amount_settlement * Decimal("0.025")).quantize(Decimal("0.01"))
        tolerance_low = (amount_invoice - charges_for_tolerance - buffer * amount_invoice).quantize(
            Decimal("0.01")
        )
        tolerance_high = (amount_settlement + buffer * amount_settlement + card_markup).quantize(
            Decimal("0.01")
        )
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
    """Advance by n business days, skipping weekends and known public holidays (#7)."""
    d = start
    added = 0
    while added < n:
        d = d + timedelta(days=1)
        if d.weekday() < 5 and d not in _PUBLIC_HOLIDAYS:
            added += 1
    return d
