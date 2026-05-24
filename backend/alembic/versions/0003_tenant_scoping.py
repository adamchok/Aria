"""add tenant_id to jobs, matches, audit_logs

Revision ID: 0003_tenant_scoping
Revises: 0002_tenants
Create Date: 2026-05-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_tenant_scoping"
down_revision = "0002_tenants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("jobs") as batch:
        batch.add_column(sa.Column("tenant_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_jobs_tenant", "tenants", ["tenant_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_jobs_tenant_id", ["tenant_id"])

    with op.batch_alter_table("matches") as batch:
        batch.add_column(sa.Column("tenant_id", sa.String(36), nullable=True))
        batch.create_index("ix_matches_tenant_id", ["tenant_id"])

    with op.batch_alter_table("audit_logs") as batch:
        batch.add_column(sa.Column("tenant_id", sa.String(36), nullable=True))
        batch.create_index("ix_audit_logs_tenant_id", ["tenant_id"])


def downgrade() -> None:
    with op.batch_alter_table("audit_logs") as batch:
        batch.drop_index("ix_audit_logs_tenant_id")
        batch.drop_column("tenant_id")

    with op.batch_alter_table("matches") as batch:
        batch.drop_index("ix_matches_tenant_id")
        batch.drop_column("tenant_id")

    with op.batch_alter_table("jobs") as batch:
        batch.drop_constraint("fk_jobs_tenant", type_="foreignkey")
        batch.drop_index("ix_jobs_tenant_id")
        batch.drop_column("tenant_id")
