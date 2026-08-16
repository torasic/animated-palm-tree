from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional
from app.models.product import ProductStatus

class ProductBase(BaseModel):
    name: str
    category: str
    quantity_kg: float
    price_per_kg: float
    status: Optional[ProductStatus] = ProductStatus.TERSEDIA

class ProductCreate(ProductBase):
    lat: Optional[float] = None
    lng: Optional[float] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    quantity_kg: Optional[float] = None
    price_per_kg: Optional[float] = None
    status: Optional[ProductStatus] = None

class ProductResponse(ProductBase):
    id: UUID
    seller_id: UUID
    photo_url: Optional[str]
    created_at: datetime
    distance_km: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    reference_price_per_kg: Optional[float] = None
    seller_name: Optional[str] = None
    seller_phone: Optional[str] = None
    seller_rating_avg: Optional[float] = None
    seller_rating_count: Optional[int] = 0
    region: Optional[str] = None


    class Config:
        from_attributes = True
