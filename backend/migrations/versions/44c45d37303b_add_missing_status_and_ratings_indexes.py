"""add_missing_status_and_ratings_indexes

Revision ID: 44c45d37303b
Revises: b32912b6bd4b
Create Date: 2026-07-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44c45d37303b'
down_revision: Union[str, Sequence[str], None] = 'b32912b6bd4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add missing indexes for status columns and ratings lookups."""

    # 1. Partial index on products.status for TERSEDIA (dominant query filter)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_products_status_tersedia "
        "ON products (status) WHERE status = 'TERSEDIA'"
    )

    # 2. Index on demand_requests.status for TERBUKA queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_demand_requests_status_terbuka "
        "ON demand_requests (status) WHERE status = 'TERBUKA'"
    )

    # 3. Composite index on ratings for correlated subqueries
    #    Used by has_buyer_rated subquery in orders.py (4 places)
    #    and rated_demand_ids batch query in demand_requests.py
    op.create_index(
        'ix_ratings_lookup',
        'ratings',
        ['reference_id', 'transaction_type', 'rater_id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_ratings_lookup', table_name='ratings')
    op.execute("DROP INDEX IF EXISTS idx_demand_requests_status_terbuka")
    op.execute("DROP INDEX IF EXISTS idx_products_status_tersedia")
