"""Deterministic mock LLM responses for CI and local dev."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

_DATE_WINDOW_DAYS = 5


def mock_extraction(*, filename: str, text_hint: str | None) -> dict[str, Any]:
    if text_hint and text_hint.startswith("MOCK|"):
        parts = [p.strip() for p in text_hint.strip().split("|")]
        currency = parts[1] if len(parts) > 1 else "USD"
        amount = parts[2] if len(parts) > 2 else "100.00"
        value_date = parts[3] if len(parts) > 3 else "2026-05-18"
        payer = parts[4] if len(parts) > 4 else "Mock Payer Ltd"
        payee = parts[5] if len(parts) > 5 else "ARIA Demo SDN BHD"
        reference = parts[6] if len(parts) > 6 else "MOCK-REF"
        confidence = 0.92
    else:
        currency = "USD"
        amount = "100.00"
        value_date = date.today().isoformat()
        payer = "Acme Inc"
        payee = "ARIA Demo SDN BHD"
        reference = filename.rsplit(".", 1)[0][:16].upper()
        confidence = 0.85

    return {
        "payer": payer,
        "payee": payee,
        "amount_original": amount,
        "currency": currency,
        "value_date": value_date,
        "reference": reference,
        "bank_charges": None,
        "extraction_confidence": confidence,
        "field_confidences": {
            "amount_original": 0.95,
            "currency": 0.99,
            "value_date": 0.9,
            "reference": 0.8,
            "payer": 0.85,
        },
        "raw_extracted_text": text_hint or f"[mock extracted text for {filename}]",
    }


def mock_bank_statement(*, text_hint: str, filename: str, base_currency: str) -> dict[str, Any]:
    from app.tools.file_parsers import parse_bank_statement_text

    if text_hint:
        if text_hint.strip().startswith("MOCK|STMT|"):
            entries: list[dict[str, Any]] = []
            for line in text_hint.splitlines():
                line = line.strip()
                if not line.startswith("MOCK|STMT|"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) < 4:
                    continue
                entries.append(
                    {
                        "value_date": parts[2],
                        "amount": parts[3],
                        "currency": base_currency,
                        "description": parts[4] if len(parts) > 4 else "",
                        "reference": parts[5] if len(parts) > 5 else None,
                        "counterparty": parts[6] if len(parts) > 6 else None,
                    }
                )
            if entries:
                return {"entries": entries}

        parsed = parse_bank_statement_text(text_hint, base_currency=base_currency)
        if parsed.entries:
            return {
                "entries": [
                    {
                        "value_date": e.value_date.isoformat(),
                        "amount": str(e.amount),
                        "currency": e.currency,
                        "description": e.description,
                        "reference": e.reference,
                        "counterparty": e.counterparty,
                    }
                    for e in parsed.entries
                ]
            }

    return {
        "entries": [
            {
                "value_date": "2026-05-20",
                "amount": "4179.24",
                "currency": base_currency,
                "description": "Inward Telegraphic Transfer Acme US Inc",
                "reference": "INV-001",
                "counterparty": "ACME US INC",
            },
            {
                "value_date": "2026-05-21",
                "amount": "5450.20",
                "currency": base_currency,
                "description": "Inward TT Euro Buyer GmbH",
                "reference": "INV-002",
                "counterparty": "EURO BUYER GMBH",
            },
            {
                "value_date": "2026-05-22",
                "amount": "4200.04",
                "currency": base_currency,
                "description": "SWIFT Credit GBP Customer Ltd",
                "reference": "INV-003",
                "counterparty": "GBP CUSTOMER LTD",
            },
            {
                "value_date": "2026-05-23",
                "amount": "9394.88",
                "currency": base_currency,
                "description": "FAST Transfer Singapore Client",
                "reference": "INV-004",
                "counterparty": "SG CLIENT PTE",
            },
        ]
    }


def mock_match_reasoning(
    normalised: dict[str, Any],
    candidate: dict[str, Any] | None,
    candidate_scores: dict[str, Any],
) -> dict[str, Any]:
    if candidate is None:
        return {
            "confidence": 0.0,
            "status": "UNMATCHED",
            "amount_variance_myr": "0",
            "variance_explanation": (
                "No bank statement entry was within the date and tolerance window."
            ),
            "reasoning_chain": (
                "Mock reasoning: empty candidate set after filter stages 1 and 2."
            ),
        }

    composite = float(candidate_scores.get("composite", 0.7))
    tol_low = Decimal(str(normalised["tolerance_low"]))
    tol_high = Decimal(str(normalised["tolerance_high"]))
    amount = Decimal(str(candidate["amount"]))
    midpoint = (tol_low + tol_high) / Decimal("2")
    variance = (amount - midpoint).quantize(Decimal("0.01"))

    if composite >= 0.75:
        status = "MATCHED"
        explanation = (
            f"Bank entry of MYR {amount} falls inside tolerance window "
            f"[{tol_low}, {tol_high}]. Variance vs. mid-window is MYR {variance}."
        )
    elif composite >= 0.5:
        status = "UNCERTAIN"
        explanation = (
            f"Bank entry of MYR {amount} sits at the edge of the tolerance window."
        )
    else:
        status = "UNMATCHED"
        explanation = "Composite confidence below review threshold."

    return {
        "confidence": composite,
        "status": status,
        "amount_variance_myr": str(variance),
        "variance_explanation": explanation,
        "reasoning_chain": (
            f"Mock chain: composite {composite:.2f} from amount/date/reference/payer weights."
        ),
    }


def mock_report_narrative(summary: dict[str, Any], exceptions: list[dict[str, Any]]) -> str:
    matched = summary.get("matched_count", 0)
    total = summary.get("total_records", 0)
    uncertain = summary.get("uncertain_count", 0)
    unmatched = summary.get("unmatched_count", 0)
    _ = exceptions
    return (
        f"ARIA reconciled {matched} of {total} payment records with high confidence. "
        f"{uncertain} item(s) were routed to human review and {unmatched} could not be "
        f"matched within the tolerance window. Total variance against bank entries was "
        f"MYR {summary.get('total_variance_myr', '0')}."
    )
