"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("progress_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("agents_completed", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("base_currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("payment_proof_keys", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("bank_statement_key", sa.String(512), nullable=True),
        sa.Column("report_blob", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "matches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id", ondelete="CASCADE"), index=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("amount_variance_myr", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("variance_explanation", sa.Text(), nullable=False, server_default=""),
        sa.Column("reasoning_chain", sa.Text(), nullable=False, server_default=""),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("human_reviewed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id", ondelete="CASCADE"), index=True),
        sa.Column("agent", sa.String(64), nullable=False),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reasoning", sa.Text(), nullable=False, server_default=""),
        sa.Column("input_snapshot", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("output_snapshot", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("timestamp", sa.DateTime(), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("matches")
    op.drop_table("jobs")
