"""add transaction_buffer table

Revision ID: 0004_ingestion_pipeline
Revises: 0003_tenant_scoping
Create Date: 2026-05-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_ingestion_pipeline"
down_revision = "0003_tenant_scoping"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transaction_buffer",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("corridor", sa.String(16), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="BUFFERED"),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_transaction_buffer_tenant_status", "transaction_buffer", ["tenant_id", "status"])
    op.create_index("ix_transaction_buffer_received_at", "transaction_buffer", ["received_at"])


def downgrade() -> None:
    op.drop_table("transaction_buffer")
