import enum
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Enum, DateTime, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.db import Base

class ScrapeStatusEnum(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            val = value.upper()
            for member in cls:
                if member.value == val or member.name == val:
                    return member
        return None

class ScraperStatus(Base):
    __tablename__ = "scraper_statuses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    last_run_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), nullable=False)
    status: Mapped[ScrapeStatusEnum] = mapped_column(Enum(ScrapeStatusEnum), nullable=False)
    items_scraped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
