"""v1 API router aggregation."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import analytics, bank_statements, export, ingest, jobs, review, stream, tenants, webhooks

api_router = APIRouter(prefix="/api/v1")

# Core reconciliation
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(review.router, prefix="/jobs", tags=["review"])
api_router.include_router(export.router, prefix="/jobs", tags=["export"])
api_router.include_router(stream.router, prefix="/jobs", tags=["stream"])

# Platform
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(bank_statements.router, prefix="/bank-statements", tags=["bank-statements"])
