import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Enum, DateTime, ForeignKey, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry
from pgvector.sqlalchemy import Vector
from app.db import Base

class DemandRequestStatus(str, enum.Enum):
    TERBUKA = "TERBUKA"
    TERPENUHI = "TERPENUHI"
    KEDALUWARSA = "KEDALUWARSA"
    DIBATALKAN = "DIBATALKAN"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.upper()
            for member in cls:
                if member.value == val or member.name == val:
                    return member
        return None

class DemandRequest(Base):
    __tablename__ = "demand_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buyer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    commodity_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity_kg_needed: Mapped[float] = mapped_column(Float, nullable=False)
    quantity_kg_committed: Mapped[float] = mapped_column(Float, default=0.0)
    price_per_kg: Mapped[float] = mapped_column(Float, default=0.0)
    deadline: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[DemandRequestStatus] = mapped_column(Enum(DemandRequestStatus), default=DemandRequestStatus.TERBUKA)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Geography Point (SRID 4326 for WGS84)
    location: Mapped[Optional[Geometry]] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, from_text="ST_GeomFromEWKT", name="geometry"),
        nullable=True
    )

    # pgvector embedding (dimensi 768)
    embedding: Mapped[Optional[Vector]] = mapped_column(Vector(768), nullable=True)

    # Relationships
    buyer = relationship("User", foreign_keys=[buyer_id])
    commitments = relationship("SupplyCommitment", back_populates="demand_request", cascade="all, delete-orphan")

class SupplyCommitment(Base):
    __tablename__ = "supply_commitments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    demand_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("demand_requests.id"), nullable=False)
    petani_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    quantity_kg_committed: Mapped[float] = mapped_column(Float, nullable=False)
    committed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    # Relationships
    demand_request = relationship("DemandRequest", back_populates="commitments")
    petani = relationship("User", foreign_keys=[petani_id])
