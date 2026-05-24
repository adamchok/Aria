"""Bank statement extraction stage."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.agents.audit import make_audit_entry
from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.core.exceptions import ExtractionError, LLMError
from app.core.logging import get_logger
from app.graph.state import DocumentInput
from app.models.enums import SourceFormat
from app.models.schemas import BankStatement
from app.tools.file_parsers import (
    bank_statement_from_llm_payload,
    detect_source_format,
    extract_pdf_text,
    parse_bank_statement_csv,
    parse_bank_statement_excel,
    parse_bank_statement_pdf,
)

logger = get_logger(__name__)

AGENT_NAME = "bank_statement_ingestion"


class BankStatementExtractionMethod(str, Enum):
    LLM_PDF = "llm_pdf"
    STRUCTURED = "structured"


@dataclass(frozen=True)
class BankStatementExtractionResult:
    statement: BankStatement
    method: BankStatementExtractionMethod


def extract_bank_statement(
    doc: DocumentInput,
    base_currency: str,
    *,
    llm: LLMService | None = None,
    storage=None,
) -> BankStatementExtractionResult:
    """Extract ledger rows from an uploaded statement file."""
    from app.services.storage import StorageService

    llm = llm or LLMService()
    storage = storage or StorageService()
    data = doc.bytes_data if doc.bytes_data is not None else storage.get_object(doc.storage_key)
    fmt = detect_source_format(doc.filename, doc.content_type)

    if fmt == SourceFormat.EXCEL:
        stmt = parse_bank_statement_excel(data, base_currency=base_currency)
        return BankStatementExtractionResult(stmt, BankStatementExtractionMethod.STRUCTURED)

    if fmt == SourceFormat.CSV:
        stmt = parse_bank_statement_csv(data, base_currency=base_currency)
        return BankStatementExtractionResult(stmt, BankStatementExtractionMethod.STRUCTURED)

    if fmt == SourceFormat.PDF:
        return _extract_pdf(data, doc, base_currency, llm)

    raise ExtractionError(f"Unsupported bank statement format: {fmt}")


def run_bank_statement_stage(ctx: ReconciliationContext, llm: LLMService | None = None) -> None:
    """Parse uploaded bank statement file into state (if not already loaded from DB)."""
    if ctx.state.bank_statement_input is None:
        return
    llm = llm or LLMService(ctx.settings)
    result = extract_bank_statement(
        ctx.state.bank_statement_input,
        ctx.base_currency,
        llm=llm,
        storage=ctx.storage,
    )
    ctx.state.bank_statement = result.statement
    ctx.state.audit_log.append(
        make_audit_entry(
            job_id=ctx.job_id,
            agent=AGENT_NAME,
            action="bank_statement_parsed",
            output_snapshot={
                "entry_count": len(result.statement.entries),
                "method": result.method.value,
            },
            reasoning=f"Extracted via {result.method.value} ({llm.mode} LLM mode).",
        )
    )


def _extract_pdf(
    data: bytes,
    doc: DocumentInput,
    base_currency: str,
    llm: LLMService,
) -> BankStatementExtractionResult:
    text_hint = extract_pdf_text(data)
    try:
        payload = llm.extract_bank_statement(
            text_hint=text_hint,
            filename=doc.filename,
            base_currency=base_currency,
            pdf_bytes=data,
        )
        stmt = bank_statement_from_llm_payload(payload, base_currency)
        if stmt.entries:
            logger.info(
                "bank_statement_ingestion.llm_success",
                filename=doc.filename,
                entry_count=len(stmt.entries),
            )
            return BankStatementExtractionResult(stmt, BankStatementExtractionMethod.LLM_PDF)
    except LLMError as exc:
        logger.warning("bank_statement_ingestion.llm_failed", filename=doc.filename, error=str(exc))
    except Exception as exc:
        logger.warning("bank_statement_ingestion.llm_unexpected", filename=doc.filename, error=str(exc))

    stmt = parse_bank_statement_pdf(data, base_currency=base_currency)
    if stmt.entries:
        logger.info(
            "bank_statement_ingestion.structured_fallback",
            filename=doc.filename,
            entry_count=len(stmt.entries),
        )
        return BankStatementExtractionResult(stmt, BankStatementExtractionMethod.STRUCTURED)

    raise ExtractionError("Could not extract transaction rows from the PDF bank statement.")
