"""v1 API router aggregation."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import export, jobs, review

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(review.router, prefix="/jobs", tags=["review"])
api_router.include_router(export.router, prefix="/jobs", tags=["export"])
