"""Structured logging — JSON format and job_id binding."""

from __future__ import annotations

import io
import json
import logging

import structlog

from app.core.logging import bind_job_id, configure_logging, get_logger


def test_logger_emits_job_id(capsys):
    configure_logging("INFO")
    bind_job_id("11111111-1111-1111-1111-111111111111")
    log = get_logger("test")
    log.info("hello", widget="aria")
    captured = capsys.readouterr().out.strip().splitlines()
    assert captured, "expected at least one log line"
    payload = json.loads(captured[-1])
    assert payload["event"] == "hello"
    assert payload["widget"] == "aria"
    assert payload["job_id"] == "11111111-1111-1111-1111-111111111111"
    bind_job_id(None)


def test_logger_omits_job_id_when_unbound(capsys):
    configure_logging("INFO")
    bind_job_id(None)
    get_logger("test").info("anonymous")
    payload = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert "job_id" not in payload
