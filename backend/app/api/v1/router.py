"""v1 API router aggregation."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    auth,
    bank_accounts,
    bank_statements,
    export,
    ingest,
    jobs,
    review,
    schedules,
    stream,
    tenant_settings,
    tenants,
    users,
    vendor_rules,
    webhooks,
)

api_router = APIRouter(prefix="/api/v1")

# Auth
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])

# Core reconciliation
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(review.router, prefix="/jobs", tags=["review"])
api_router.include_router(export.router, prefix="/jobs", tags=["export"])
api_router.include_router(stream.router, prefix="/jobs", tags=["stream"])

# Platform
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
api_router.include_router(tenant_settings.router, prefix="/tenant", tags=["tenant-settings"])
api_router.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(bank_statements.router, prefix="/bank-statements", tags=["bank-statements"])
api_router.include_router(bank_accounts.router, prefix="/bank-accounts", tags=["bank-accounts"])
api_router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
api_router.include_router(vendor_rules.router, prefix="/vendor-rules", tags=["vendor-rules"])
