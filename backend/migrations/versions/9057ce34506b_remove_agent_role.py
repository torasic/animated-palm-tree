"""remove_agent_role

Revision ID: 9057ce34506b
Revises: 24ac0d244831
Create Date: 2026-07-16 22:25:12.226650

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9057ce34506b'
down_revision: Union[str, Sequence[str], None] = '24ac0d244831'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Rename existing enum type
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    
    # 2. Create new enum type
    op.execute("CREATE TYPE userrole AS ENUM ('PETANI', 'PEMBELI')")
    
    # 3. Alter role column to use new enum type
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::text::userrole")
    
    # 4. Drop the old enum type
    op.execute("DROP TYPE userrole_old")


def downgrade() -> None:
    """Downgrade schema."""
    # 1. Rename current enum type
    op.execute("ALTER TYPE userrole RENAME TO userrole_old")
    
    # 2. Create old enum type with 'AGEN'
    op.execute("CREATE TYPE userrole AS ENUM ('PETANI', 'PEMBELI', 'AGEN')")
    
    # 3. Alter role column
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::text::userrole")
    
    # 4. Drop the old enum type
    op.execute("DROP TYPE userrole_old")
