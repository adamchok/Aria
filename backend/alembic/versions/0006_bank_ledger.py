"""add bank_statements ledger, bank_entries, and bank_statement_id on jobs

Revision ID: 0006_bank_ledger
Revises: 0005_webhooks
Create Date: 2026-05-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_bank_ledger"
down_revision = "0005_webhooks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_statements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("filename", sa.String(512), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=True),
        sa.Column("base_currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("statement_period_start", sa.Date(), nullable=True),
        sa.Column("statement_period_end", sa.Date(), nullable=True),
        sa.Column("entry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_bank_statements_tenant_id", "bank_statements", ["tenant_id"])

    op.create_table(
        "bank_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "statement_id",
            sa.String(36),
            sa.ForeignKey("bank_statements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tenant_id", sa.String(36), nullable=True),
        sa.Column("value_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(20, 6), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("counterparty", sa.String(255), nullable=True),
        sa.Column("raw_row", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("cleared", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "cleared_by_job_id",
            sa.String(36),
            sa.ForeignKey("jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_bank_entries_statement_id", "bank_entries", ["statement_id"])
    op.create_index("ix_bank_entries_tenant_cleared", "bank_entries", ["tenant_id", "cleared"])
    op.create_index("ix_bank_entries_value_date", "bank_entries", ["value_date"])

    # Link jobs to the reusable ledger statement.
    op.add_column(
        "jobs",
        sa.Column(
            "bank_statement_id",
            sa.String(36),
            sa.ForeignKey("bank_statements.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "bank_statement_id")
    op.drop_index("ix_bank_entries_value_date", "bank_entries")
    op.drop_index("ix_bank_entries_tenant_cleared", "bank_entries")
    op.drop_index("ix_bank_entries_statement_id", "bank_entries")
    op.drop_table("bank_entries")
    op.drop_index("ix_bank_statements_tenant_id", "bank_statements")
    op.drop_table("bank_statements")
