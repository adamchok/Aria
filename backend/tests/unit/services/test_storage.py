"""Storage service — local filesystem mode."""

from __future__ import annotations

import os
import tempfile

import pytest

from app.core.config import Settings
from app.services.storage import StorageService


@pytest.fixture
def local_storage(monkeypatch):
    tmp = tempfile.mkdtemp(prefix="aria_st_")
    monkeypatch.setenv("S3_ENDPOINT", f"local://{tmp}")
    monkeypatch.setenv("APP_ENV", "test")
    settings = Settings(_env_file=None, s3_endpoint=f"local://{tmp}")
    return StorageService(settings=settings)


def test_put_get_round_trip(local_storage):
    key = local_storage.put_object(b"hello world", "test.txt", content_type="text/plain")
    assert key.endswith("test.txt")
    assert local_storage.get_object(key) == b"hello world"


def test_presign_returns_file_url(local_storage):
    key = local_storage.put_object(b"data", "x.bin")
    url = local_storage.presign_get(key)
    assert url.startswith("file://")
