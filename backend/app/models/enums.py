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
    CANCELLED = "CANCELLED"


class MatchStatus(StrEnum):
    MATCHED = "MATCHED"
    UNCERTAIN = "UNCERTAIN"
    UNMATCHED = "UNMATCHED"


class ReviewAction(StrEnum):
    CONFIRM = "confirm"
    REJECT = "reject"
    MANUAL_MATCH = "manual_match"


class BufferStatus(StrEnum):
    BUFFERED = "BUFFERED"
    BATCHED = "BATCHED"


class WebhookEvent(StrEnum):
    JOB_COMPLETED = "job.completed"
    JOB_FAILED = "job.failed"
    JOB_REVIEW_REQUIRED = "job.review_required"
    JOB_CREATED = "job.created"


class WebhookDeliveryStatus(StrEnum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    DISABLED = "DISABLED"


class UserRole(StrEnum):
    ADMIN = "admin"
    TENANT_USER = "tenant_user"
