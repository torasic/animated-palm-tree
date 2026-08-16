import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Enum, DateTime, ForeignKey, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.db import Base

class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    EXPIRED = "expired"
    FAILED = "failed"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.lower()
            for member in cls:
                if member.value == val or member.name.lower() == val:
                    return member
        return None

class EscrowStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    HELD = "held"
    RELEASED = "released"
    REFUNDED = "refunded"
    DISPUTED = "disputed"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.lower()
            for member in cls:
                if member.value == val or member.name.lower() == val:
                    return member
        return None

class DemandTransaction(Base):
    __tablename__ = "demand_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    demand_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("demand_requests.id"), nullable=False)
    seller_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    product_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    price_per_kg: Mapped[float] = mapped_column(Float, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)

    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.PENDING)
    escrow_status: Mapped[EscrowStatus] = mapped_column(Enum(EscrowStatus), default=EscrowStatus.NOT_STARTED)

    xendit_invoice_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    xendit_invoice_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    xendit_external_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    confirmed_received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    disbursement_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    disbursement_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    disbursed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Relationships
    demand_request = relationship("DemandRequest")
    seller = relationship("User", foreign_keys=[seller_id])
    product = relationship("Product", foreign_keys=[product_id])

class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "pesanan" | "permintaan"
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    xendit_external_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
