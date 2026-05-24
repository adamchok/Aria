"""Server-Sent Events endpoint for real-time job progress."""

from __future__ import annotations

import json
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.dependencies import get_db_session
from app.core.logging import get_logger
from app.core.middleware import require_tenant
from app.models.enums import JobStatus
from app.repositories.job_repository import JobRepository

router = APIRouter()
logger = get_logger(__name__)

_CHANNEL_PREFIX = "aria:sse:"
_KEEPALIVE_TIMEOUT = 25.0  # seconds


def _channel(job_id: str) -> str:
    return f"{_CHANNEL_PREFIX}{job_id}"


def _sse_line(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _terminal_event_name(status: str) -> str:
    if status == JobStatus.FAILED:
        return "error"
    if status == JobStatus.AWAITING_REVIEW:
        return "review_required"
    return "completed"


async def publish_event(job_id: str, event: str, data: dict) -> None:
    """Publish an SSE event via Redis so any Uvicorn worker can pick it up."""
    settings = get_settings()
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        msg = json.dumps({"event": event, "data": data})
        await r.publish(_channel(job_id), msg)
    except Exception:  # noqa: BLE001
        logger.warning("sse.publish_failed", job_id=job_id, event=event)
    finally:
        await r.aclose()


@router.get("/{job_id}/stream")
async def stream_job(
    job_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> StreamingResponse:
    repo = JobRepository(session, tenant_id=tenant_id)
    job = await repo.get(job_id)  # raises 404 if not found or wrong tenant

    async def _event_generator():
        # Send current state immediately on connect
        yield _sse_line("status_change", {
            "status": job.status,
            "progress_pct": job.progress_pct,
            "agents_completed": list(job.agents_completed or []),
        })

        terminal = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.AWAITING_REVIEW}
        if JobStatus(job.status) in terminal:
            event_name = _terminal_event_name(job.status)
            yield _sse_line(event_name, {"status": job.status, "error": job.error})
            return

        settings = get_settings()
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(_channel(str(job_id)))
        try:
            while True:
                if await request.is_disconnected():
                    break
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=_KEEPALIVE_TIMEOUT,
                )
                if message is None:
                    yield ": keepalive\n\n"
                    continue
                msg = json.loads(message["data"])
                yield _sse_line(msg["event"], msg["data"])
                if msg["event"] in {"completed", "error", "review_required"}:
                    break
        finally:
            await pubsub.unsubscribe(_channel(str(job_id)))
            await r.aclose()

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
