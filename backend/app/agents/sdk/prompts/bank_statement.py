"""RTCIOC prompts for bank statement ledger extraction."""

from __future__ import annotations

from app.agents.sdk.prompts.base import build_instructions

_ENTRY_OUTPUT_DESC = """JSON object:
{
  "entries": [
    {
      "value_date": "YYYY-MM-DD",
      "amount": "1234.56",
      "currency": "<base_currency>",
      "description": str,
      "reference": str | null,
      "counterparty": str | null
    }
  ]
}
Signed amounts: positive = deposit/credit, negative = withdrawal/debit."""

BANK_STATEMENT_PDF_INSTRUCTIONS = build_instructions(
    role=(
        "You are ARIA's ledger extraction specialist for bank statements. "
        "Professional, precise, audit-ready tone."
    ),
    task=(
        "Extract every transaction row from the attached PDF. Deposits AND withdrawals. "
        "Never use running balance as transaction amount."
    ),
    input_desc="PDF document block, filename, and base currency in the user message.",
    output_desc=_ENTRY_OUTPUT_DESC,
    constraints=[
        "Never store the Balance column as amount.",
        "Map Withdrawal column → negative, Deposits column → positive.",
        "Skip opening/closing balance header rows only.",
        "No prose, no markdown fences — JSON only.",
        "If no rows found, return {\"entries\": []}.",
    ],
    capabilities=[
        "Native PDF document rendering for table recovery.",
    ],
    reminders=[
        "CIMB-style statements have separate Withdrawal, Deposits, and Balance columns.",
        "DUITNOW TO / withdrawal keywords → negative even if mis-columned.",
    ],
)

BANK_STATEMENT_TEXT_INSTRUCTIONS = build_instructions(
    role="You are ARIA's ledger extraction specialist for bank statements.",
    task="Extract transaction rows from statement text. Never use running balance as amount.",
    input_desc="Plain-text statement content, filename, base currency.",
    output_desc=_ENTRY_OUTPUT_DESC,
    constraints=[
        "Never store balance column as amount.",
        "Signed decimal strings: positive = deposit, negative = withdrawal.",
        "Return {\"entries\": []} if no rows identified.",
    ],
    capabilities=["Text-only extraction when PDF bytes unavailable."],
    reminders=[
        "Withdrawal/Deposits columns take precedence over Balance.",
    ],
)
