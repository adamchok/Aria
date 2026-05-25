"""Payment proof ingestion stage."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.agents.audit import make_audit_entry
from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.agents.sdk.stages.bank_statement import run_bank_statement_stage
from app.core.config import get_settings
from app.core.exceptions import ExtractionError
from app.core.logging import get_logger
from app.graph.state import DocumentInput
from app.models.enums import JobStatus, SourceFormat
from app.models.schemas import PaymentRecord
from app.repositories.vendor_rules_repository import normalize_payee
from app.tools.file_parsers import (
    detect_source_format,
    extract_pdf_text,
    parse_bank_statement_excel,
    preprocess_image,
)

logger = get_logger(__name__)

AGENT_NAME = "ingestion"


async def run_ingestion_stage(ctx: ReconciliationContext, llm: LLMService | None = None) -> None:
    """Extract payment proofs and optional bank statement file."""
    ctx.state.status = JobStatus.INGESTING
    llm = llm or LLMService(ctx.settings)
    settings = ctx.settings

    run_bank_statement_stage(ctx, llm=llm)

    if settings.llm_mode == "live":
        llm._get_anthropic()

    loop = asyncio.get_running_loop()
    n = len(ctx.state.payment_documents)
    max_workers = min(n, 10) if n else 1

    records: list[PaymentRecord] = []
    if n:
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            tasks = [
                loop.run_in_executor(pool, _extract_one, doc, ctx, llm)
                for doc in ctx.state.payment_documents
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for doc, result in zip(ctx.state.payment_documents, results):
            if isinstance(result, Exception):
                logger.error("ingestion.extract.failed", filename=doc.filename, error=str(result))
                ctx.state.audit_log.append(_fail_audit(ctx.job_id, doc, result))
            else:
                records.append(result)
                ctx.state.audit_log.append(_extract_audit(ctx.job_id, doc, result, llm.mode))

    ctx.state.payment_records = records
    ctx.state.agents_completed.append("ingestion")
    logger.info("ingestion.complete", count=len(records), parallel=True)


def _extract_one(doc: DocumentInput, ctx: ReconciliationContext, llm: LLMService) -> PaymentRecord:
    data = doc.bytes_data if doc.bytes_data is not None else ctx.storage.get_object(doc.storage_key)
    fmt = detect_source_format(doc.filename, doc.content_type)
    settings = ctx.settings

    text_hint: str | None = None
    bytes_for_llm = data

    if fmt == SourceFormat.PDF:
        text_hint = extract_pdf_text(data)
    elif fmt == SourceFormat.EXCEL:
        wb_rows = parse_bank_statement_excel(data, base_currency=settings.base_currency)
        text_hint = "\n".join(
            f"{e.value_date.isoformat()} | {e.amount} | {e.description}"
            for e in wb_rows.entries[:50]
        )
    elif fmt == SourceFormat.CSV:
        text_hint = data.decode("utf-8", errors="replace")[:8_000]
    elif fmt == SourceFormat.IMAGE:
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
                bytes_for_llm = data

    try:
        payload = llm.extract_payment_record(
            document_bytes=bytes_for_llm,
            filename=doc.filename,
            source_format=fmt,
            text_hint=text_hint,
        )
    except Exception as exc:
        raise ExtractionError(f"LLM extraction failed for {doc.filename}: {exc}") from exc

    payload = _apply_vendor_rules(payload, ctx.vendor_rules)

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


def _apply_vendor_rules(payload: dict, vendor_rules: list[dict]) -> dict:
    """Override LLM-extracted fields with stored vendor corrections."""
    if not vendor_rules:
        return payload
    payee_normalized = normalize_payee(payload.get("payee", ""))
    if not payee_normalized:
        return payload

    applied = False
    for rule in vendor_rules:
        pattern = rule["payee_pattern"]
        if not pattern:
            continue
        # Substring match after normalization: "moonshot ai" ⊂ "moonshot ai pte ltd"
        if pattern in payee_normalized or payee_normalized in pattern:
            field = rule["field_name"]
            corrected = rule["corrected_value"]
            if payload.get(field) != corrected:
                if not applied:
                    payload = dict(payload)
                    applied = True
                payload[field] = corrected
                fc = dict(payload.get("field_confidences") or {})
                fc[field] = 0.90
                payload["field_confidences"] = fc
                logger.info(
                    "vendor_rule.applied",
                    payee=payload.get("payee"),
                    field=field,
                    corrected=corrected,
                )
    return payload


def _extract_audit(job_id, doc: DocumentInput, record: PaymentRecord, mode: str):
    return make_audit_entry(
        job_id=job_id,
        agent=AGENT_NAME,
        action="extract",
        input_snapshot={"filename": doc.filename, "storage_key": doc.storage_key},
        output_snapshot=record.model_dump(mode="json"),
        confidence=record.extraction_confidence,
        reasoning=(
            f"Extracted via {mode} mode from {record.source_format.value}; "
            f"extraction_confidence={record.extraction_confidence:.2f}."
        ),
    )


def _fail_audit(job_id, doc: DocumentInput, exc: Exception):
    return make_audit_entry(
        job_id=job_id,
        agent=AGENT_NAME,
        action="extract_failed",
        input_snapshot={"filename": doc.filename},
        reasoning=str(exc),
    )
