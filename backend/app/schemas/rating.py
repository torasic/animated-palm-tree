from pydantic import BaseModel, Field
from uuid import UUID
from typing import List, Optional
from datetime import datetime
from app.models.rating import RoleContext, TransactionType

class RatingCreateSchema(BaseModel):
    transaction_type: TransactionType
    reference_id: UUID
    score: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

class RatingResponseSchema(BaseModel):
    id: UUID
    rater_id: UUID
    rated_id: UUID
    role_context: RoleContext
    transaction_type: TransactionType
    reference_id: UUID
    score: int
    comment: Optional[str]
    created_at: datetime
    rater_name: Optional[str] = None

    class Config:
        from_attributes = True

class RatingSummarySchema(BaseModel):
    ratings: List[RatingResponseSchema]
    average: float
    count: int
