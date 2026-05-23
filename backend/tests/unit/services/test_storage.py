"""Storage service — local filesystem mode and S3 SSE behaviour."""

from __future__ import annotations

import tempfile
from unittest.mock import MagicMock

import pytest

from app.core.config import Settings
from app.core.exceptions import StorageError
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


def test_put_object_omits_sse_by_default():
    settings = Settings(
        _env_file=None,
        s3_endpoint="http://minio:9000",
        s3_server_side_encryption=None,
    )
    client = MagicMock()
    service = StorageService(settings=settings)
    service._client = client  # noqa: SLF001

    key = service.put_object(b"payload", "proof.pdf", content_type="application/pdf")

    assert key.endswith("proof.pdf")
    client.put_object.assert_called_once()
    assert "ServerSideEncryption" not in client.put_object.call_args.kwargs


def test_put_object_retries_without_sse_when_backend_rejects_kms():
    settings = Settings(
        _env_file=None,
        s3_endpoint="http://minio:9000",
        s3_server_side_encryption="AES256",
    )
    client = MagicMock()
    client.put_object.side_effect = [
        Exception(
            "An error occurred (NotImplemented) when calling the PutObject operation: "
            "Server side encryption specified but KMS is not configured"
        ),
        None,
    ]
    service = StorageService(settings=settings)
    service._client = client  # noqa: SLF001

    key = service.put_object(b"payload", "proof.pdf")

    assert key.endswith("proof.pdf")
    assert client.put_object.call_count == 2
    assert "ServerSideEncryption" not in client.put_object.call_args.kwargs


def test_put_object_raises_when_non_sse_error():
    settings = Settings(
        _env_file=None,
        s3_endpoint="http://minio:9000",
        s3_server_side_encryption="AES256",
    )
    client = MagicMock()
    client.put_object.side_effect = Exception("AccessDenied")
    service = StorageService(settings=settings)
    service._client = client  # noqa: SLF001

    with pytest.raises(StorageError, match="put_object failed"):
        service.put_object(b"payload", "proof.pdf")
