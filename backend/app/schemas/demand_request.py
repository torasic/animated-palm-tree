from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import List, Optional
from app.models.demand_request import DemandRequestStatus

class DemandRequestCreate(BaseModel):
    commodity_name: str = Field(..., max_length=255)
    category: str = Field(..., max_length=100)
    quantity_kg_needed: float = Field(..., gt=0)
    price_per_kg: float = Field(..., gt=0)
    deadline: datetime
    latitude: float
    longitude: float

class DemandCommitmentCreate(BaseModel):
    quantity_kg: float = Field(..., gt=0)

class SupplyCommitmentSummary(BaseModel):
    id: UUID
    quantity_kg_committed: float
    committed_at: datetime
    petani_name: Optional[str] = None
    petani_phone: Optional[str] = None
    petani_id: Optional[UUID] = None

    class Config:
        from_attributes = True

class DemandRequestResponse(BaseModel):
    id: UUID
    buyer_id: UUID
    commodity_name: str
    category: str
    quantity_kg_needed: float
    quantity_kg_committed: float
    price_per_kg: float
    deadline: datetime
    status: DemandRequestStatus
    created_at: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    buyer_name: Optional[str] = None
    buyer_rating_avg: Optional[float] = None
    buyer_rating_count: int = 0

    class Config:
        from_attributes = True

class DemandRequestDetailResponse(DemandRequestResponse):
    buyer_phone: Optional[str] = None
    commitments: List[SupplyCommitmentSummary] = []
    num_petani_committed: int = 0
    has_petani_rated: bool = False
    match_transaction: Optional[dict] = None   # kept for backwards compat (latest)
    match_transactions: List[dict] = []        # all transactions for this request

    class Config:
        from_attributes = True

class DemandRegionalAnalyticsResponse(BaseModel):
    commodity_name: str
    province: str
    total_needed_kg: float
    total_committed_kg: float
    num_requests: int
    fulfillment_ratio: float
    status: str
    open_requests: List[DemandRequestResponse] = []


class DemandMatchCandidate(BaseModel):
    product_id: UUID
    seller_id: UUID
    seller_name: str
    product_name: str
    price_per_kg: float
    quantity_kg: float
    distance_score: float


class DemandMatchRequest(BaseModel):
    product_id: UUID
    quantity_kg: Optional[float] = None

