"""Cryptographic utilities: API key generation, hashing, HMAC signing, JWT auth."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

_KEY_PREFIX = "aria_"
_KEY_BYTES = 32  # 256-bit raw key


# ─── Password helpers ────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ─── JWT helpers ─────────────────────────────────────────────────────────────


def create_access_token(
    *,
    user_id: str,
    role: str,
    tenant_id: str | None,
    secret: str,
    algorithm: str = "HS256",
    expires_minutes: int = 1440,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    payload: dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "tenant_id": tenant_id,
        "exp": expire,
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def decode_access_token(token: str, secret: str, algorithm: str = "HS256") -> dict[str, Any]:
    """Decode and verify JWT. Raises jwt.PyJWTError on failure."""
    return jwt.decode(token, secret, algorithms=[algorithm])


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
