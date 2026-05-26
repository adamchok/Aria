"""Model provider selection and LangSmith tracing setup for pipeline runs."""

from __future__ import annotations

import os

from app.core.config import Settings, get_settings


def get_llm_service(settings: Settings | None = None):
    """Return the active LLM service (mock or Anthropic live)."""
    from app.agents.sdk.llm_service import LLMService

    return LLMService(settings=settings or get_settings())


def configure_agents_sdk_tracing(settings: Settings | None = None) -> None:
    """Wire LangSmith tracing for the pipeline.

    Sets the env vars LangSmith reads, installs OpenAIAgentsTracingProcessor
    so any agents.Runner.run() calls are captured, and enables the SDK tracer.
    """
    settings = settings or get_settings()
    if not settings.langsmith_tracing or not settings.langsmith_api_key:
        return

    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key
    os.environ["LANGCHAIN_PROJECT"] = settings.langsmith_project
    os.environ["LANGCHAIN_ENDPOINT"] = settings.langsmith_endpoint

    # Route OpenAI Agents SDK traces to LangSmith (per docs.langchain.com/langsmith/trace-with-openai-agents-sdk)
    try:
        from langsmith.integrations.openai_agents_sdk import OpenAIAgentsTracingProcessor
        from agents import add_trace_processor, set_tracing_disabled

        add_trace_processor(OpenAIAgentsTracingProcessor())
        set_tracing_disabled(False)
    except (ImportError, Exception):
        pass
