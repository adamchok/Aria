"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import Base, get_engine
from app.core.exceptions import (
    AriaError,
    ExtractionError,
    FXRateUnavailableError,
    InvalidJobStateError,
    JobNotFoundError,
    LLMError,
    MatchNotFoundError,
    StorageError,
)
from app.core.logging import configure_logging, get_logger

settings = get_settings()
configure_logging(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # For dev/test convenience we create tables on startup. Production should
    # rely on Alembic migrations only.
    if settings.app_env in {"development", "test"}:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    logger.info("aria.startup", env=settings.app_env, version=__version__)
    yield
    logger.info("aria.shutdown")


app = FastAPI(
    title="ARIA — Autonomous Reconciliation Intelligence Agent",
    version=__version__,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__, "env": settings.app_env}


# ─── Exception handlers (domain → HTTP) ────────────────────────────────────


@app.exception_handler(JobNotFoundError)
async def _job_not_found(_request: Request, exc: JobNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(MatchNotFoundError)
async def _match_not_found(_request: Request, exc: MatchNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(InvalidJobStateError)
async def _invalid_state(_request: Request, exc: InvalidJobStateError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.exception_handler(ExtractionError)
async def _extraction(_request: Request, exc: ExtractionError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(FXRateUnavailableError)
async def _fx_unavailable(_request: Request, exc: FXRateUnavailableError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(StorageError)
async def _storage(_request: Request, exc: StorageError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(LLMError)
async def _llm(_request: Request, exc: LLMError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(AriaError)
async def _aria(_request: Request, exc: AriaError) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": str(exc)})
