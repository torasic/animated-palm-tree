import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Enum, DateTime, ForeignKey, Float, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db import Base

class OrderStatus(str, enum.Enum):
    CHECKOUT_SELESAI = "CHECKOUT_SELESAI"
    MENUNGGU_KONFIRMASI = "MENUNGGU_KONFIRMASI"
    DIPROSES = "DIPROSES"
    SIAP_DIAMBIL = "SIAP_DIAMBIL"
    DIKIRIM = "DIKIRIM"
    DITERIMA = "DITERIMA"
    MASA_KOMPLAIN = "MASA_KOMPLAIN"
    KOMPLAIN_DIPROSES = "KOMPLAIN_DIPROSES"
    SELESAI = "SELESAI"
    DIBATALKAN = "DIBATALKAN"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.upper()
            if val == "DIPESAN":
                return cls.MENUNGGU_KONFIRMASI
            if val == "DIKONFIRMASI":
                return cls.DIPROSES
            if val == "BATAL":
                return cls.DIBATALKAN
            for member in cls:
                if member.value == val or member.name == val:
                    return member
        return None

class CancellationReason(str, enum.Enum):
    PETANI_MENOLAK = "PETANI_MENOLAK"
    PEMBELI_BATAL = "PEMBELI_BATAL"
    TIMEOUT_KONFIRMASI = "TIMEOUT_KONFIRMASI"
    TIMEOUT_PENGAMBILAN = "TIMEOUT_PENGAMBILAN"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.upper()
            for member in cls:
                if member.value == val or member.name == val:
                    return member
        return None

class ComplaintReason(str, enum.Enum):
    BARANG_RUSAK = "BARANG_RUSAK"
    TIDAK_SESUAI_DESKRIPSI = "TIDAK_SESUAI_DESKRIPSI"
    KUALITAS_BURUK = "KUALITAS_BURUK"
    LAINNYA = "LAINNYA"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.upper()
            for member in cls:
                if member.value == val or member.name == val:
                    return member
        return None

from app.models.payment_transaction import PaymentStatus, EscrowStatus

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    buyer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.MENUNGGU_KONFIRMASI)
    buyer_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # New fields for state machine
    cancellation_reason: Mapped[Optional[CancellationReason]] = mapped_column(Enum(CancellationReason), nullable=True)
    complaint_reason: Mapped[Optional[ComplaintReason]] = mapped_column(Enum(ComplaintReason), nullable=True)
    complaint_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status_updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    marked_ready_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    complained_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Escrow payment fields
    payment_status: Mapped[Optional[PaymentStatus]] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.PENDING, nullable=True)
    escrow_status: Mapped[Optional[EscrowStatus]] = mapped_column(Enum(EscrowStatus), default=EscrowStatus.NOT_STARTED, nullable=True)
    xendit_invoice_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    xendit_invoice_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    xendit_external_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    confirmed_received_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    disbursement_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    disbursement_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    disbursed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
