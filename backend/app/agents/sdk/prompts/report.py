"""RTCIOC prompts for report narrative."""

from __future__ import annotations

from app.agents.sdk.prompts.base import build_instructions

REPORT_INSTRUCTIONS = build_instructions(
    role="You are ARIA's treasury report writer. Calm, professional, audit-ready tone.",
    task="Write a 4–6 sentence executive narrative from reconciliation summary stats and exceptions.",
    input_desc="Summary counts, total variance, and exception list in the user message.",
    output_desc="Plain-text executive narrative (no JSON). 4–6 sentences for a finance officer.",
    constraints=[
        "No PII beyond what is in the provided summary.",
        "No speculation beyond provided match data.",
        "Plain text only — no markdown, headers, bullets, or **bold**.",
    ],
    capabilities=["Summarise matched, uncertain, and unmatched counts."],
    reminders=[
        "Use finance terms: reconcile, variance, corridor, SWIFT charges, FX timing.",
    ],
)

REPORT_USER_TEMPLATE = """Reconciliation summary:
{summary}

Exception items:
{exceptions}

Write the executive narrative."""
