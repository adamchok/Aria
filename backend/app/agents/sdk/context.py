"""Shared dependency-injection context for SDK agent runs."""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from app.core.config import Settings, get_settings
from app.graph.state import ReconciliationState
from app.services.storage import StorageService


@dataclass
class ReconciliationContext:
    """Grab-bag passed through pipeline stages and LLM calls."""

    state: ReconciliationState
    tenant_id: str | None = None
    settings: Settings = field(default_factory=get_settings)
    storage: StorageService = field(default_factory=StorageService)
    # Vendor corrections loaded from DB at pipeline start; read-only during run.
    vendor_rules: list[dict] = field(default_factory=list)

    @property
    def job_id(self) -> UUID:
        return self.state.job_id

    @property
    def base_currency(self) -> str:
        return self.state.base_currency

    @property
    def llm_mode(self) -> str:
        return self.settings.llm_mode
