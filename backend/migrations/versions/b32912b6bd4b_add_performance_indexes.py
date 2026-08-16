"""add_performance_indexes

Revision ID: b32912b6bd4b
Revises: 15479b117cd1
Create Date: 2026-07-28 14:00:41.694886

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b32912b6bd4b'
down_revision: Union[str, Sequence[str], None] = '15479b117cd1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Spatial Indexes (GiST)
    op.execute("CREATE INDEX IF NOT EXISTS idx_products_location ON products USING gist (location)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_location ON users USING gist (location)")
    
    # 2. Foreign Key Indexes
    op.create_index('ix_products_seller_id', 'products', ['seller_id'])
    op.create_index('ix_orders_product_id', 'orders', ['product_id'])
    op.create_index('ix_orders_buyer_id', 'orders', ['buyer_id'])
    op.create_index('ix_supply_commitments_demand_request_id', 'supply_commitments', ['demand_request_id'])
    op.create_index('ix_supply_commitments_petani_id', 'supply_commitments', ['petani_id'])
    op.create_index('ix_demand_requests_buyer_id', 'demand_requests', ['buyer_id'])
    
    # 3. Reference Prices Composite Index
    op.create_index('ix_ref_prices_query', 'reference_prices', ['commodity_name', 'region', 'scraped_at'])
    
    # 4. HNSW Vector Indexes for Semantic Search (pgvector)
    op.execute("CREATE INDEX IF NOT EXISTS idx_products_embedding ON products USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_demand_requests_embedding ON demand_requests USING hnsw (embedding vector_cosine_ops)")

    # 5. Database-backed Cache Table
    op.create_table('divergence_analysis_cache',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('commodity_name', sa.String(length=255), nullable=False),
        sa.Column('region', sa.String(length=255), nullable=False),
        sa.Column('days', sa.Integer(), nullable=False),
        sa.Column('result_json', sa.JSON(), nullable=False),
        sa.Column('cache_date', sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_div_cache_lookup', 'divergence_analysis_cache', ['commodity_name', 'region', 'days', 'cache_date'])


def downgrade() -> None:
    """Downgrade schema."""
    # 5. Drop Cache Table and its Index
    op.drop_index('ix_div_cache_lookup', table_name='divergence_analysis_cache')
    op.drop_table('divergence_analysis_cache')
    
    # 4. Drop Vector Indexes
    op.execute("DROP INDEX IF EXISTS idx_demand_requests_embedding")
    op.execute("DROP INDEX IF EXISTS idx_products_embedding")
    
    # 3. Drop Composite Index
    op.drop_index('ix_ref_prices_query', table_name='reference_prices')
    
    # 2. Drop Foreign Key Indexes
    op.drop_index('ix_demand_requests_buyer_id', table_name='demand_requests')
    op.drop_index('ix_supply_commitments_petani_id', table_name='supply_commitments')
    op.drop_index('ix_supply_commitments_demand_request_id', table_name='supply_commitments')
    op.drop_index('ix_orders_buyer_id', table_name='orders')
    op.drop_index('ix_orders_product_id', table_name='orders')
    op.drop_index('ix_products_seller_id', table_name='products')
    
    # 1. Drop Spatial Indexes
    op.execute("DROP INDEX IF EXISTS idx_users_location")
    op.execute("DROP INDEX IF EXISTS idx_products_location")
