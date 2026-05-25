"""bank entry and statement deduplication

Revision ID: 0013_bank_entry_dedup
Revises: 0012_reconciliation_schedules
Create Date: 2026-05-26

Option B: content_hash per bank_entry (unique per account, skips duplicates across overlapping statements).
Option C: file_hash per bank_statement (rejects exact re-uploads at the API layer with HTTP 409).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0013_bank_entry_dedup'
down_revision: Union[str, None] = '0012_reconciliation_schedules'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Option C: file-level fingerprint on bank_statements
    op.add_column('bank_statements', sa.Column('file_hash', sa.String(64), nullable=True))
    # Partial unique index: only enforce when both account and hash are present.
    # NULL values are ignored by this index, so manual/unlinked statements are unaffected.
    op.create_index(
        'uq_bank_statements_account_file_hash',
        'bank_statements',
        ['account_id', 'file_hash'],
        unique=True,
        postgresql_where=sa.text('account_id IS NOT NULL AND file_hash IS NOT NULL'),
    )

    # Option B: entry-level fingerprint on bank_entries
    op.add_column('bank_entries', sa.Column('content_hash', sa.String(64), nullable=True))
    # Partial unique index: only enforce when hash is present (NULL = manual/legacy entry).
    op.create_index(
        'uq_bank_entries_content_hash',
        'bank_entries',
        ['content_hash'],
        unique=True,
        postgresql_where=sa.text('content_hash IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_bank_entries_content_hash', table_name='bank_entries')
    op.drop_column('bank_entries', 'content_hash')
    op.drop_index('uq_bank_statements_account_file_hash', table_name='bank_statements')
    op.drop_column('bank_statements', 'file_hash')
