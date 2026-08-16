from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from app.models.order import OrderStatus, CancellationReason, ComplaintReason

class OrderCreate(BaseModel):
    product_id: UUID
    quantity_kg: float

class OrderResponse(BaseModel):
    id: UUID
    product_id: UUID
    buyer_id: UUID
    quantity_kg: float
    status: OrderStatus
    buyer_confirmed_at: Optional[datetime] = None
    has_buyer_rated: bool = False
    created_at: datetime
    
    cancellation_reason: Optional[CancellationReason] = None
    
    # Joined metadata fields
    product_name: Optional[str] = None
    product_photo_url: Optional[str] = None
    price_per_kg: Optional[float] = None
    buyer_name: Optional[str] = None
    buyer_phone: Optional[str] = None
    seller_name: Optional[str] = None
    seller_phone: Optional[str] = None
    seller_id: Optional[UUID] = None

    # Escrow payment fields
    payment_status: Optional[str] = None
    escrow_status: Optional[str] = None
    xendit_invoice_id: Optional[str] = None
    xendit_invoice_url: Optional[str] = None
    xendit_external_id: Optional[str] = None
    paid_at: Optional[datetime] = None
    confirmed_received_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class OrderComplaint(BaseModel):
    reason: ComplaintReason
    description: str
