"""Add bank_account_id on jobs for account-scoped ledger reconciliation.

Revision ID: 0009_job_bank_account_id
Revises: 0008_users_auth
Create Date: 2026-05-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_job_bank_account_id"
down_revision = "0008_users_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "bank_account_id",
            sa.String(36),
            sa.ForeignKey("bank_accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_jobs_bank_account_id", "jobs", ["bank_account_id"])


def downgrade() -> None:
    op.drop_index("ix_jobs_bank_account_id", table_name="jobs")
    op.drop_column("jobs", "bank_account_id")
