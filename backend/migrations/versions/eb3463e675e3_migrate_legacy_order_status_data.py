"""migrate_legacy_order_status_data

Revision ID: eb3463e675e3
Revises: af3756ce4f4a
Create Date: 2026-07-22 22:42:47

Migrates legacy order status values (DIPESAN, DIKONFIRMASI, BATAL)
to the new workflow enum values. Fixes LookupError crash when SQLAlchemy
deserializes rows containing old enum values not defined in Python's OrderStatus.

Mapping:
  DIPESAN      → MENUNGGU_KONFIRMASI  (placed, awaiting farmer confirmation)
  DIKONFIRMASI → DIPROSES             (farmer confirmed, being processed)
  BATAL        → DIBATALKAN           (cancelled)

Note: SIAP_DIAMBIL, SELESAI already exist in both old and new enums — no change needed.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = 'eb3463e675e3'
down_revision: Union[str, Sequence[str], None] = 'af3756ce4f4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Migrate legacy order status data to new workflow values.
    Uses raw SQL with ::text cast to bypass ORM enum validation during UPDATE.
    NOTE: We intentionally skip ALTER COLUMN NOT NULL to avoid Supabase DDL timeouts.
    The nullable=True constraint on status_updated_at is acceptable since all rows
    are now populated by the UPDATE below.
    """
    # Migrate DIPESAN → MENUNGGU_KONFIRMASI
    op.execute("""
        UPDATE orders
        SET status = 'MENUNGGU_KONFIRMASI'::orderstatus
        WHERE status::text = 'DIPESAN'
    """)

    # Migrate DIKONFIRMASI → DIPROSES
    op.execute("""
        UPDATE orders
        SET status = 'DIPROSES'::orderstatus
        WHERE status::text = 'DIKONFIRMASI'
    """)

    # Migrate BATAL → DIBATALKAN
    op.execute("""
        UPDATE orders
        SET status = 'DIBATALKAN'::orderstatus
        WHERE status::text = 'BATAL'
    """)

    # Populate status_updated_at for any rows still NULL
    op.execute("""
        UPDATE orders
        SET status_updated_at = created_at
        WHERE status_updated_at IS NULL
    """)


def downgrade() -> None:
    """
    Data migration is intentionally not reversed — we cannot safely determine
    which orders were originally DIPESAN vs MENUNGGU_KONFIRMASI.
    """
    pass
