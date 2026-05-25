"""Add vendor_rules table for AI learning from human review corrections.

Revision ID: 0010_vendor_rules
Revises: 0009_job_bank_account_id
Create Date: 2026-05-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0010_vendor_rules"
down_revision = "0009_job_bank_account_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vendor_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payee_pattern", sa.String(255), nullable=False),
        sa.Column("field_name", sa.String(64), nullable=False),
        sa.Column("corrected_value", sa.String(255), nullable=False),
        sa.Column("original_value", sa.String(255), nullable=True),
        sa.Column(
            "source_job_id",
            sa.String(36),
            sa.ForeignKey("jobs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_note", sa.Text, nullable=True),
        sa.Column("applied_count", sa.Integer, nullable=False, default=0),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_vendor_rules_tenant", "vendor_rules", ["tenant_id"])
    op.create_unique_constraint(
        "uq_vendor_rules_payee_field",
        "vendor_rules",
        ["tenant_id", "payee_pattern", "field_name"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_vendor_rules_payee_field", "vendor_rules", type_="unique")
    op.drop_index("ix_vendor_rules_tenant", table_name="vendor_rules")
    op.drop_table("vendor_rules")
