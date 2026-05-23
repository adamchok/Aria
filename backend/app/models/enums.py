"""Enums used across schemas and DB models."""

from __future__ import annotations

from enum import StrEnum


class SourceFormat(StrEnum):
    IMAGE = "IMAGE"
    PDF = "PDF"
    EXCEL = "EXCEL"
    CSV = "CSV"


class JobStatus(StrEnum):
    PENDING = "PENDING"
    INGESTING = "INGESTING"
    NORMALISING = "NORMALISING"
    MATCHING = "MATCHING"
    REPORTING = "REPORTING"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class MatchStatus(StrEnum):
    MATCHED = "MATCHED"
    UNCERTAIN = "UNCERTAIN"
    UNMATCHED = "UNMATCHED"


class ReviewAction(StrEnum):
    CONFIRM = "confirm"
    REJECT = "reject"
    MANUAL_MATCH = "manual_match"
