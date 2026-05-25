"""Password hashing and JWT utilities."""

from __future__ import annotations

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.enums import UserRole


def test_hash_and_verify_password():
    hashed = hash_password("secretpass123")
    assert hashed != "secretpass123"
    assert verify_password("secretpass123", hashed)
    assert not verify_password("wrong", hashed)


def test_jwt_create_and_decode_includes_role():
    settings = get_settings()
    token = create_access_token(
        user_id="user-1",
        role=UserRole.ADMIN.value,
        tenant_id=None,
        secret=settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
        expires_minutes=60,
    )
    payload = decode_access_token(token, settings.jwt_secret_key, settings.jwt_algorithm)
    assert payload["sub"] == "user-1"
    assert payload["role"] == "admin"
    assert payload.get("tenant_id") is None


def test_webhook_secret_encrypt_roundtrip():
    from app.core.security import decrypt_webhook_secret, encrypt_webhook_secret

    settings = get_settings()
    raw = "whsec_test_secret_value"
    encrypted = encrypt_webhook_secret(
        raw,
        encryption_key="test-encryption-key",
        fallback_secret=settings.jwt_secret_key,
    )
    assert not encrypted.startswith("whsec_")
    restored = decrypt_webhook_secret(
        encrypted,
        encryption_key="test-encryption-key",
        fallback_secret=settings.jwt_secret_key,
    )
    assert restored == raw
