"""Cryptographic utilities: API key generation, hashing, HMAC signing."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time


_KEY_PREFIX = "aria_"
_KEY_BYTES = 32  # 256-bit raw key


def generate_api_key() -> tuple[str, str]:
    """Return (raw_key, key_hash). Store only the hash; show raw once."""
    raw = _KEY_PREFIX + secrets.token_hex(_KEY_BYTES)
    return raw, hash_key(raw)


def hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def generate_webhook_secret() -> tuple[str, str]:
    """Return (raw_secret, secret_hash). Store only the hash; show raw once."""
    raw = "whsec_" + secrets.token_hex(_KEY_BYTES)
    return raw, hash_key(raw)


def sign_webhook_payload(secret: str, timestamp: int, body: bytes) -> str:
    """Produce HMAC-SHA256 signature for webhook delivery.

    Signature format mirrors Stripe: sha256=<hex>
    Signed string: "{timestamp}.{body}"
    """
    msg = f"{timestamp}.".encode() + body
    sig = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def verify_webhook_signature(
    secret: str, signature: str, timestamp: str, body: bytes, tolerance_seconds: int = 300
) -> bool:
    age = abs(time.time() - int(timestamp))
    if age > tolerance_seconds:
        return False
    expected = sign_webhook_payload(secret, int(timestamp), body)
    return hmac.compare_digest(expected, signature)


# SSRF guard — block delivery to loopback / link-local / private ranges
_BLOCKED_PREFIXES = (
    "http://localhost",
    "https://localhost",
    "http://127.",
    "https://127.",
    "http://10.",
    "https://10.",
    "http://192.168.",
    "https://192.168.",
    "http://169.254.",
    "https://169.254.",
)


def is_safe_webhook_url(url: str) -> bool:
    return not any(url.lower().startswith(p) for p in _BLOCKED_PREFIXES)
