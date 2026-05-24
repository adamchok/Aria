"""Anthropic integration hook for OpenAI Agents SDK.

Pipeline specialists call ``LLMService`` directly (Anthropic SDK) with RTCIOC
prompts. This module documents the provider boundary and exposes agent
metadata for tracing.
"""

from __future__ import annotations

AGENT_PROVIDER_NAME = "anthropic"
