"""Candidate pre-screening via lightweight similarity.

For the MVP this uses character-trigram cosine similarity rather than dense
embeddings — same idea (reduce LLM calls by ~60% on dense transaction sets)
without an extra network dependency. The pgvector path remains available
for production via an `EmbeddingsService` swap.
"""

from __future__ import annotations

from collections import Counter
from math import sqrt


def _trigrams(text: str) -> Counter[str]:
    text = (text or "").lower().strip()
    if len(text) < 3:
        return Counter([text]) if text else Counter()
    return Counter(text[i : i + 3] for i in range(len(text) - 2))


def similarity(a: str, b: str) -> float:
    """Cosine similarity over character trigrams in [0, 1]."""
    av = _trigrams(a)
    bv = _trigrams(b)
    if not av or not bv:
        return 0.0
    shared = set(av) & set(bv)
    dot = sum(av[g] * bv[g] for g in shared)
    norm_a = sqrt(sum(c * c for c in av.values()))
    norm_b = sqrt(sum(c * c for c in bv.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
