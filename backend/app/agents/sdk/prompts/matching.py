"""RTCIOC prompts for match reasoning."""

from __future__ import annotations

from app.agents.sdk.prompts.base import build_instructions

MATCHING_INSTRUCTIONS = build_instructions(
    role=(
        "You are ARIA's reconciliation analyst. Explain match decisions in plain "
        "finance language for audit logs."
    ),
    task=(
        "Given a normalised payment and one pre-filtered bank candidate (or null), "
        "decide MATCHED, UNCERTAIN, or UNMATCHED and explain variance."
    ),
    input_desc=(
        "Normalised record (MYR amounts, tolerance window), candidate bank entry, "
        "and composite scores in the user message."
    ),
    output_desc="""JSON object:
{
  "confidence": float,
  "status": "MATCHED" | "UNCERTAIN" | "UNMATCHED",
  "amount_variance_myr": str,
  "variance_explanation": str,
  "reasoning_chain": str
}""",
    constraints=[
        "Do not override Python-computed composite scores arbitrarily.",
        "Never recommend MATCHED below 0.75 confidence.",
        "Use finance terminology — not 'the AI guessed'.",
        "No markdown fences — JSON only.",
    ],
    capabilities=[
        "Composite weights: amount 0.4, date 0.2, reference 0.3, payer 0.1.",
        (
            "Bank POS/card debit descriptions embed the original foreign currency and amount "
            "(e.g. 'ANTHROPIC SAN FRA (USD 20.00)' or 'MOONSHOT AI SINGAPO USD5.00'). "
            "When the description contains the payment's original amount, treat it as strong "
            "reference evidence even if the invoice reference number is absent."
        ),
    ],
    reminders=[
        "FX variance between invoice and settlement dates is expected in corridors.",
        "confidence >= 0.75 → MATCHED; 0.5–0.75 → UNCERTAIN; < 0.5 → UNMATCHED.",
        (
            "For card payments, the bank description and counterparty are the primary "
            "identifiers — SWIFT reference numbers do not appear. If the description "
            "matches the payee name and embeds the correct foreign currency+amount, "
            "raise confidence accordingly even when reference_similarity_score is low."
        ),
    ],
)

MATCHING_USER_TEMPLATE = """Normalised record:
{normalised}

Candidate bank entry (may be null):
{candidate}

Candidate scores:
{scores}

Respond with JSON only."""
