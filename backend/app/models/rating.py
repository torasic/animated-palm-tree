import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Enum, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db import Base

class RoleContext(str, enum.Enum):
    AS_SELLER = "AS_SELLER"
    AS_BUYER = "AS_BUYER"

class TransactionType(str, enum.Enum):
    PRODUCT_PURCHASE = "PRODUCT_PURCHASE"
    DEMAND_FULFILLMENT = "DEMAND_FULFILLMENT"

class Rating(Base):
    __tablename__ = "ratings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rater_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    rated_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role_context: Mapped[RoleContext] = mapped_column(Enum(RoleContext), nullable=False)
    transaction_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    reference_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    __table_args__ = (
        UniqueConstraint('rater_id', 'rated_id', 'transaction_type', 'reference_id', name='uq_rater_rated_transaction_ref'),
    )
