"""upgrade_order_status_workflow

Revision ID: af3756ce4f4a
Revises: 661c1e158f82
Create Date: 2026-07-22 22:26:49.636272

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af3756ce4f4a'
down_revision: Union[str, Sequence[str], None] = '661c1e158f82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Update orderstatus enum type in PostgreSQL
    with op.get_context().autocommit_block():
        for val in ['CHECKOUT_SELESAI', 'MENUNGGU_KONFIRMASI', 'DIPROSES', 'DIKIRIM', 'DITERIMA', 'MASA_KOMPLAIN', 'DIBATALKAN', 'KOMPLAIN_DIPROSES']:
            op.execute(f"ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS '{val}'")

    # 2. Create new enum types
    cancellation_reason_enum = sa.Enum('PETANI_MENOLAK', 'PEMBELI_BATAL', 'TIMEOUT_KONFIRMASI', 'TIMEOUT_PENGAMBILAN', name='cancellationreason')
    complaint_reason_enum = sa.Enum('BARANG_RUSAK', 'TIDAK_SESUAI_DESKRIPSI', 'KUALITAS_BURUK', 'LAINNYA', name='complaintreason')
    
    cancellation_reason_enum.create(op.get_bind(), checkfirst=True)
    complaint_reason_enum.create(op.get_bind(), checkfirst=True)

    # 3. Add columns to orders table
    op.add_column('orders', sa.Column('cancellation_reason', cancellation_reason_enum, nullable=True))
    op.add_column('orders', sa.Column('complaint_reason', complaint_reason_enum, nullable=True))
    op.add_column('orders', sa.Column('complaint_description', sa.String(length=500), nullable=True))
    op.add_column('orders', sa.Column('status_updated_at', sa.DateTime(), nullable=True))
    op.add_column('orders', sa.Column('marked_ready_at', sa.DateTime(), nullable=True))
    op.add_column('orders', sa.Column('received_at', sa.DateTime(), nullable=True))
    op.add_column('orders', sa.Column('complained_at', sa.DateTime(), nullable=True))
    op.add_column('orders', sa.Column('completed_at', sa.DateTime(), nullable=True))

    # Set status_updated_at for existing orders to created_at
    op.execute("UPDATE orders SET status_updated_at = created_at WHERE status_updated_at IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    # Drop added columns
    op.drop_column('orders', 'completed_at')
    op.drop_column('orders', 'complained_at')
    op.drop_column('orders', 'received_at')
    op.drop_column('orders', 'marked_ready_at')
    op.drop_column('orders', 'status_updated_at')
    op.drop_column('orders', 'complaint_description')
    op.drop_column('orders', 'complaint_reason')
    op.drop_column('orders', 'cancellation_reason')

    # Drop enums
    op.execute("DROP TYPE IF EXISTS cancellationreason")
    op.execute("DROP TYPE IF EXISTS complaintreason")
    # Note: We do not drop orderstatus enum values because PostgreSQL does not support easy deletion of enum values.
