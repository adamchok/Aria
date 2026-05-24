"""Model provider selection for OpenAI Agents SDK runs."""

from __future__ import annotations

from app.core.config import Settings, get_settings


def get_llm_service(settings: Settings | None = None):
    """Return the active LLM service (mock or Anthropic live)."""
    from app.agents.sdk.llm_service import LLMService

    return LLMService(settings=settings or get_settings())


def configure_agents_sdk_tracing(settings: Settings | None = None) -> None:
    """Enable OpenAI Agents SDK tracing when configured."""
    settings = settings or get_settings()
    if not getattr(settings, "agents_sdk_tracing", False):
        return
    try:
        from agents import set_tracing_disabled

        set_tracing_disabled(False)
    except ImportError:
        pass
