"""Pydantic structured outputs for SDK specialists."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import MatchStatus, SourceFormat
from app.models.schemas import PaymentRecord


class PaymentRecordExtract(BaseModel):
    payer: str
    payee: str
    amount_original: str
    currency: str
    value_date: str
    reference: str | None = None
    bank_charges: str | None = None
    extraction_confidence: float = 0.5
    field_confidences: dict[str, float] = Field(default_factory=dict)
    raw_extracted_text: str = ""

    def to_payment_record(
        self,
        *,
        source_format: SourceFormat,
        source_document: str | None,
    ) -> PaymentRecord:
        return PaymentRecord(
            payer=self.payer,
            payee=self.payee,
            amount_original=Decimal(self.amount_original),
            currency=self.currency.upper(),
            value_date=date.fromisoformat(self.value_date),
            reference=self.reference,
            bank_charges=Decimal(self.bank_charges) if self.bank_charges else None,
            source_format=source_format,
            extraction_confidence=self.extraction_confidence,
            raw_extracted_text=self.raw_extracted_text,
            field_confidences=self.field_confidences,
            source_document=source_document,
        )


class BankStatementEntryExtract(BaseModel):
    value_date: str
    amount: str
    currency: str
    description: str = ""
    reference: str | None = None
    counterparty: str | None = None


class BankStatementExtract(BaseModel):
    entries: list[BankStatementEntryExtract] = Field(default_factory=list)

    def to_payload(self) -> dict[str, Any]:
        return {
            "entries": [
                {
                    "value_date": e.value_date,
                    "amount": e.amount,
                    "currency": e.currency,
                    "description": e.description,
                    "reference": e.reference,
                    "counterparty": e.counterparty,
                }
                for e in self.entries
            ]
        }


class MatchReasoningResult(BaseModel):
    confidence: float
    status: MatchStatus
    amount_variance_myr: str = "0"
    variance_explanation: str = ""
    reasoning_chain: str = ""


class ReportNarrative(BaseModel):
    narrative: str
