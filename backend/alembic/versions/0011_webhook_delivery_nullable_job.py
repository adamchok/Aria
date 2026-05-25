"""Allow webhook test deliveries without a real job row.

Revision ID: 0011_webhook_null_job
Revises: 0010_vendor_rules
Create Date: 2026-05-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_webhook_null_job"
down_revision = "0010_vendor_rules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("webhook_deliveries", "job_id", existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    op.alter_column("webhook_deliveries", "job_id", existing_type=sa.String(36), nullable=False)
