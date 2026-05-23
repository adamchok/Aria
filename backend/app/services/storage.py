"""Object-storage wrapper for raw payment proofs and bank statements.

Uses boto3 against an S3-compatible endpoint (MinIO in dev, AWS S3 in prod).
For local-only operation without MinIO running, set ``S3_ENDPOINT=local://``
and a temp directory will be used instead.
"""

from __future__ import annotations

import io
import os
import uuid
from pathlib import Path
from typing import Any

import boto3
from botocore.client import Config

from app.core.config import Settings, get_settings
from app.core.exceptions import StorageError
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._local_root: Path | None = None
        if self._settings.s3_endpoint.startswith("local://"):
            self._local_root = Path(self._settings.s3_endpoint.removeprefix("local://") or "./_uploads")
            self._local_root.mkdir(parents=True, exist_ok=True)
            self._client = None
        else:
            self._client = boto3.client(
                "s3",
                endpoint_url=self._settings.s3_endpoint,
                aws_access_key_id=self._settings.s3_access_key,
                aws_secret_access_key=self._settings.s3_secret_key,
                region_name=self._settings.s3_region,
                config=Config(signature_version="s3v4"),
            )

    @property
    def bucket(self) -> str:
        return self._settings.s3_bucket

    def ensure_bucket(self) -> None:
        if self._client is None:
            return
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except Exception:
            try:
                self._client.create_bucket(Bucket=self.bucket)
                logger.info("storage.bucket.created", bucket=self.bucket)
            except Exception as exc:
                raise StorageError(f"Cannot ensure bucket {self.bucket}: {exc}") from exc

    def put_object(self, body: bytes, filename: str, content_type: str | None = None) -> str:
        """Store ``body`` and return its storage key."""
        key = f"{uuid.uuid4()}/{filename}"
        if self._local_root is not None:
            target = self._local_root / key
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
            return key

        assert self._client is not None
        extra: dict[str, Any] = {}
        if content_type:
            extra["ContentType"] = content_type
        # ServerSideEncryption requested for AES-256 at rest where the backend supports it.
        extra["ServerSideEncryption"] = "AES256"
        try:
            self._client.put_object(Bucket=self.bucket, Key=key, Body=body, **extra)
        except Exception as exc:
            # MinIO without SSE config still works without the header.
            if "ServerSideEncryption" in str(exc):
                extra.pop("ServerSideEncryption", None)
                self._client.put_object(Bucket=self.bucket, Key=key, Body=body, **extra)
            else:
                raise StorageError(f"put_object failed: {exc}") from exc
        return key

    def get_object(self, key: str) -> bytes:
        if self._local_root is not None:
            return (self._local_root / key).read_bytes()
        assert self._client is not None
        try:
            resp = self._client.get_object(Bucket=self.bucket, Key=key)
            return resp["Body"].read()
        except Exception as exc:
            raise StorageError(f"get_object failed for {key}: {exc}") from exc

    def presign_get(self, key: str, ttl_seconds: int | None = None) -> str:
        ttl = ttl_seconds or self._settings.s3_presign_ttl_seconds
        if self._local_root is not None:
            return f"file://{(self._local_root / key).resolve()}"
        assert self._client is not None
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=ttl,
            )
        except Exception as exc:
            raise StorageError(f"presign failed for {key}: {exc}") from exc
