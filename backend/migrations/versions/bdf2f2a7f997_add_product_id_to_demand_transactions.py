"""add product_id to demand_transactions

Revision ID: bdf2f2a7f997
Revises: c94b96552459
Create Date: 2026-07-30 18:46:27.741066

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'bdf2f2a7f997'
down_revision: Union[str, Sequence[str], None] = 'c94b96552459'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('demand_transactions', sa.Column('product_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_demand_transactions_product_id', 'demand_transactions', 'products', ['product_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_demand_transactions_product_id', 'demand_transactions', type_='foreignkey')
    op.drop_column('demand_transactions', 'product_id')
