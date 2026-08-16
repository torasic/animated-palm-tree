from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import List, Optional

class ReferencePriceResponse(BaseModel):
    id: UUID
    commodity_name: str
    price_per_kg: float
    source: str
    region: str
    scraped_at: datetime

    class Config:
        from_attributes = True

class PaginatedReferencePrices(BaseModel):
    items: List[ReferencePriceResponse]
    total: int
    page: int
    limit: int
    pages: int
    distinct_commodities: List[str]
