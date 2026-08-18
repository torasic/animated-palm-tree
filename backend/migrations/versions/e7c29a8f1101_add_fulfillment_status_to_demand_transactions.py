"""add fulfillment_status and marked_ready_at to demand_transactions

Revision ID: e7c29a8f1101
Revises: bdf2f2a7f997
Create Date: 2026-08-18 07:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e7c29a8f1101'
down_revision: Union[str, Sequence[str], None] = 'bdf2f2a7f997'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('demand_transactions', sa.Column('fulfillment_status', sa.String(length=50), server_default='DIPROSES', nullable=True))
    op.add_column('demand_transactions', sa.Column('marked_ready_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('demand_transactions', 'marked_ready_at')
    op.drop_column('demand_transactions', 'fulfillment_status')
