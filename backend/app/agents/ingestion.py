"""Agent 1 — Document Ingestion.

Vision-first extraction via the LLM client. PDF/Excel/CSV use structured
parsers with an LLM hint pass. Bank statements use pdfplumber table/text
extraction for PDFs, with an LLM fallback when structured parsing finds no rows.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.agents.audit import make_audit_entry
from app.core.config import get_settings
from app.core.exceptions import ExtractionError
from app.core.logging import get_logger
from app.models.enums import JobStatus, SourceFormat
from app.models.schemas import PaymentRecord
from app.services.llm_client import LLMClient
from app.services.storage import StorageService
from app.tools.file_parsers import (
    bank_statement_from_llm_payload,
    detect_source_format,
    extract_pdf_text,
    parse_bank_statement_csv,
    parse_bank_statement_excel,
    parse_bank_statement_pdf,
    preprocess_image,
)

from app.graph.state import DocumentInput, ReconciliationState

logger = get_logger(__name__)


class IngestionAgent:
    def __init__(
        self,
        llm: LLMClient | None = None,
        storage: StorageService | None = None,
    ) -> None:
        self._llm = llm or LLMClient()
        self._storage = storage or StorageService()
        self._settings = get_settings()

    def __call__(self, state: ReconciliationState) -> ReconciliationState:
        return self.run(state)

    def run(self, state: ReconciliationState) -> ReconciliationState:
        """Sync entry point used by LangGraph node and test suite."""
        state.status = JobStatus.INGESTING

        # 1. Bank statement (structured-only; single call — no parallelism needed).
        if state.bank_statement_input is not None:
            stmt = self._parse_bank_statement(state.bank_statement_input, state.base_currency)
            state.bank_statement = stmt
            state.audit_log.append(
                make_audit_entry(
                    job_id=state.job_id,
                    agent="ingestion",
                    action="bank_statement_parsed",
                    output_snapshot={"entry_count": len(stmt.entries)},
                )
            )

        # 2. Payment proofs — sequential for sync callers.
        records: list[PaymentRecord] = []
        for doc in state.payment_documents:
            try:
                record = self._extract_one(doc)
                records.append(record)
                state.audit_log.append(self._extract_audit(state.job_id, doc, record))
            except ExtractionError as exc:
                logger.error("ingestion.extract.failed", filename=doc.filename, error=str(exc))
                state.audit_log.append(self._fail_audit(state.job_id, doc, exc))

        state.payment_records = records
        state.agents_completed.append("ingestion")
        logger.info("ingestion.complete", count=len(records))
        return state

    async def arun(self, state: ReconciliationState) -> ReconciliationState:
        """Async entry point: extracts all payment proofs in parallel.

        Bank statement parsing is sequential (single call). Payment proofs are
        dispatched concurrently via a thread pool because the Anthropic SDK is
        synchronous. On 50 documents this cuts ingestion latency from O(n·latency)
        to ~O(latency of slowest call).
        """
        state.status = JobStatus.INGESTING

        if state.bank_statement_input is not None:
            stmt = self._parse_bank_statement(state.bank_statement_input, state.base_currency)
            state.bank_statement = stmt
            state.audit_log.append(
                make_audit_entry(
                    job_id=state.job_id,
                    agent="ingestion",
                    action="bank_statement_parsed",
                    output_snapshot={"entry_count": len(stmt.entries)},
                )
            )

        # Pre-warm the Anthropic client before spawning threads to avoid lazy-init race.
        if self._settings.llm_mode == "live":
            self._llm._get_anthropic()

        loop = asyncio.get_running_loop()
        n = len(state.payment_documents)
        max_workers = min(n, 10)  # cap at 10 concurrent LLM calls

        records: list[PaymentRecord] = []
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            tasks = [
                loop.run_in_executor(pool, self._extract_one, doc)
                for doc in state.payment_documents
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for doc, result in zip(state.payment_documents, results):
            if isinstance(result, Exception):
                logger.error("ingestion.extract.failed", filename=doc.filename, error=str(result))
                state.audit_log.append(self._fail_audit(state.job_id, doc, result))
            else:
                records.append(result)
                state.audit_log.append(self._extract_audit(state.job_id, doc, result))

        state.payment_records = records
        state.agents_completed.append("ingestion")
        logger.info("ingestion.complete", count=len(records), parallel=True)
        return state

    # ── helpers ───────────────────────────────────────────────────────────

    def _extract_audit(self, job_id, doc: DocumentInput, record: PaymentRecord):
        return make_audit_entry(
            job_id=job_id,
            agent="ingestion",
            action="extract",
            input_snapshot={"filename": doc.filename, "storage_key": doc.storage_key},
            output_snapshot=record.model_dump(mode="json"),
            confidence=record.extraction_confidence,
            reasoning=(
                f"Extracted via {self._llm.mode} mode from {record.source_format.value}; "
                f"extraction_confidence={record.extraction_confidence:.2f}."
            ),
        )

    def _fail_audit(self, job_id, doc: DocumentInput, exc: Exception):
        return make_audit_entry(
            job_id=job_id,
            agent="ingestion",
            action="extract_failed",
            input_snapshot={"filename": doc.filename},
            reasoning=str(exc),
        )

    def _load_bytes(self, doc: DocumentInput) -> bytes:
        if doc.bytes_data is not None:
            return doc.bytes_data
        return self._storage.get_object(doc.storage_key)

    def _parse_bank_statement(self, doc: DocumentInput, base_currency: str):
        data = self._load_bytes(doc)
        fmt = detect_source_format(doc.filename, doc.content_type)
        if fmt == SourceFormat.EXCEL:
            return parse_bank_statement_excel(data, base_currency=base_currency)
        if fmt == SourceFormat.CSV:
            return parse_bank_statement_csv(data, base_currency=base_currency)
        if fmt == SourceFormat.PDF:
            stmt = parse_bank_statement_pdf(data, base_currency=base_currency)
            if not stmt.entries:
                text = extract_pdf_text(data)
                # Sonnet with native document block parses tables pdfplumber misses.
                payload = self._llm.extract_bank_statement(
                    text_hint=text,
                    filename=doc.filename,
                    base_currency=base_currency,
                    pdf_bytes=data,
                )
                stmt = bank_statement_from_llm_payload(payload, base_currency)
            if not stmt.entries:
                raise ExtractionError(
                    "Could not extract transaction rows from the PDF bank statement."
                )
            return stmt
        raise ExtractionError(f"Unsupported bank statement format: {fmt}")

    def _extract_one(self, doc: DocumentInput) -> PaymentRecord:
        data = self._load_bytes(doc)
        fmt = detect_source_format(doc.filename, doc.content_type)

        text_hint: str | None = None
        bytes_for_llm = data

        if fmt == SourceFormat.PDF:
            text_hint = extract_pdf_text(data)
        elif fmt == SourceFormat.EXCEL:
            # Pass as text hint via openpyxl values.
            wb_rows = parse_bank_statement_excel(data, base_currency=self._settings.base_currency)
            text_hint = "\n".join(
                f"{e.value_date.isoformat()} | {e.amount} | {e.description}"
                for e in wb_rows.entries[:50]
            )
        elif fmt == SourceFormat.CSV:
            text_hint = data.decode("utf-8", errors="replace")[:8_000]
        elif fmt == SourceFormat.IMAGE:
            # Allow callers (tests, demo) to embed a deterministic "MOCK|..." hint
            # in the file body itself for the mock LLM path. Detect this before
            # image preprocessing so we don't fail on non-image bytes.
            try:
                snippet = data[:200].decode("utf-8", errors="ignore")
            except Exception:
                snippet = ""
            if snippet.startswith("MOCK|"):
                text_hint = snippet
            else:
                try:
                    bytes_for_llm = preprocess_image(data)
                except Exception:
                    # Not a decodable image — leave bytes as-is; the LLM client
                    # (or live model) will surface an error if needed.
                    bytes_for_llm = data

        try:
            payload = self._llm.extract_payment_record(
                document_bytes=bytes_for_llm,
                filename=doc.filename,
                source_format=fmt,
                text_hint=text_hint,
            )
        except Exception as exc:
            raise ExtractionError(f"LLM extraction failed for {doc.filename}: {exc}") from exc

        return PaymentRecord(
            payer=payload["payer"],
            payee=payload["payee"],
            amount_original=payload["amount_original"],
            currency=payload["currency"],
            value_date=payload["value_date"],
            reference=payload.get("reference"),
            bank_charges=payload.get("bank_charges"),
            source_format=fmt,
            extraction_confidence=float(payload.get("extraction_confidence", 0.5)),
            raw_extracted_text=payload.get("raw_extracted_text", ""),
            field_confidences=payload.get("field_confidences", {}),
            source_document=doc.storage_key,
        )
