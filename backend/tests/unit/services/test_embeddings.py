"""Trigram similarity acts as the cheap pre-screening signal."""

from __future__ import annotations

from app.services.embeddings import similarity


def test_identical_strings_are_one():
    assert similarity("acme us inc", "acme us inc") == 1.0


def test_disjoint_strings_low():
    assert similarity("acme us inc", "xyzcorp pte ltd") < 0.2


def test_substring_match_high():
    assert similarity("acme us inc", "inward transfer acme us inc remittance") > 0.4


def test_empty_inputs():
    assert similarity("", "abc") == 0.0
    assert similarity("abc", "") == 0.0
