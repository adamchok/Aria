"""Domain exception hierarchy. API layer maps these to HTTP status codes."""

from __future__ import annotations


class AriaError(Exception):
    """Root domain exception."""


class JobNotFoundError(AriaError):
    """Requested job does not exist."""


class MatchNotFoundError(AriaError):
    """Requested match record does not exist."""


class InvalidJobStateError(AriaError):
    """Operation not valid for the current job state."""


class ExtractionError(AriaError):
    """Document extraction failed."""


class FXRateUnavailableError(AriaError):
    """No FX rate could be retrieved from any provider."""


class StorageError(AriaError):
    """Object-storage operation failed."""


class LLMError(AriaError):
    """LLM call failed (transport, parsing, or schema validation)."""


class AuthenticationError(AriaError):
    """Invalid or missing API key."""


class AuthorizationError(AriaError):
    """Caller lacks permission for this operation."""


class TenantNotFoundError(AriaError):
    """Requested tenant does not exist."""


class WebhookNotFoundError(AriaError):
    """Requested webhook does not exist."""
