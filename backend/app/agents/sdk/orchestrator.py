"""Reconciliation orchestrator — manager agent with specialists as tools."""

from __future__ import annotations

from agents import Agent

from app.agents.sdk.prompts.bank_statement import BANK_STATEMENT_PDF_INSTRUCTIONS
from app.agents.sdk.prompts.ingestion import INGESTION_INSTRUCTIONS
from app.agents.sdk.prompts.matching import MATCHING_INSTRUCTIONS
from app.agents.sdk.prompts.orchestrator import ORCHESTRATOR_INSTRUCTIONS
from app.agents.sdk.prompts.report import REPORT_INSTRUCTIONS
from app.core.config import get_settings

ORCHESTRATOR_NAME = "ReconciliationOrchestrator"


def build_specialist_agents() -> dict[str, Agent]:
    """SDK Agent definitions for each pipeline specialist."""
    settings = get_settings()
    return {
        "ingestion": Agent(
            name="IngestionSpecialist",
            instructions=INGESTION_INSTRUCTIONS,
            model=settings.sonnet_model,
        ),
        "bank_statement": Agent(
            name="BankStatementSpecialist",
            instructions=BANK_STATEMENT_PDF_INSTRUCTIONS,
            model=settings.sonnet_model,
        ),
        "matching": Agent(
            name="MatchingSpecialist",
            instructions=MATCHING_INSTRUCTIONS,
            model=settings.sonnet_model,
        ),
        "report": Agent(
            name="ReportSpecialist",
            instructions=REPORT_INSTRUCTIONS,
            model=settings.sonnet_model,
        ),
    }


def build_orchestrator_agent() -> Agent:
    """Manager agent exposing specialists via ``as_tool()``."""
    specialists = build_specialist_agents()
    return Agent(
        name=ORCHESTRATOR_NAME,
        instructions=ORCHESTRATOR_INSTRUCTIONS,
        model=get_settings().haiku_model,
        tools=[
            specialists["ingestion"].as_tool(
                tool_name="extract_payment_proofs",
                tool_description="Extract structured payment records from uploaded proofs.",
            ),
            specialists["bank_statement"].as_tool(
                tool_name="parse_bank_statement",
                tool_description="Parse bank statement file into ledger entries (LLM-first PDF).",
            ),
            specialists["matching"].as_tool(
                tool_name="match_records",
                tool_description="Match normalised payments against bank ledger with LLM reasoning.",
            ),
            specialists["report"].as_tool(
                tool_name="generate_report",
                tool_description="Synthesise executive reconciliation report narrative.",
            ),
        ],
    )
