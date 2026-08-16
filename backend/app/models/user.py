import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Enum, DateTime, Float, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, column_property
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry
from app.db import Base

class UserRole(str, enum.Enum):
    PETANI = "PETANI"
    PEMBELI = "PEMBELI"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.upper()
            for member in cls:
                if member.value == val or member.name == val:
                    return member
        return None

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    google_sub: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    role: Mapped[Optional[UserRole]] = mapped_column(Enum(UserRole), nullable=True)
    phone_whatsapp: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    theme_color: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Cache fields for ratings
    seller_rating_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.0)
    seller_rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    buyer_rating_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.0)
    buyer_rating_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Geography Point (SRID 4326 for WGS84)
    location: Mapped[Optional[Geometry]] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, from_text="ST_GeomFromEWKT", name="geometry"),
        nullable=True
    )
    
    bank_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bank_account_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    bank_account_holder: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    latitude = column_property(func.ST_Y(location))
    longitude = column_property(func.ST_X(location))
