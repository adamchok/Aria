"""Bank accounts — tenants' named bank accounts with statement grouping.

Revision ID: 0007_bank_accounts
Revises: 0006_bank_ledger
Create Date: 2026-05-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_bank_accounts"
down_revision = "0006_bank_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("bank_name", sa.String(255), nullable=False),
        sa.Column("account_number_masked", sa.String(50), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_bank_accounts_tenant_id", "bank_accounts", ["tenant_id"])

    op.add_column(
        "bank_statements",
        sa.Column(
            "account_id",
            sa.String(36),
            sa.ForeignKey("bank_accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_bank_statements_account_id", "bank_statements", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_bank_statements_account_id", table_name="bank_statements")
    op.drop_column("bank_statements", "account_id")
    op.drop_index("ix_bank_accounts_tenant_id", table_name="bank_accounts")
    op.drop_table("bank_accounts")
