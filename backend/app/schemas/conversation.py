from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional

class ConversationCreate(BaseModel):
    product_id: Optional[UUID] = None
    seller_id: Optional[UUID] = None
    buyer_id: Optional[UUID] = None

class ConversationCreateResponse(BaseModel):
    conversation_id: UUID

class OtherParticipantInfo(BaseModel):
    id: UUID
    full_name: str
    avatar_url: Optional[str] = None
    role: Optional[str] = None

class LastProductInfo(BaseModel):
    id: UUID
    name: str
    photo_url: Optional[str] = None

class LastMessageInfo(BaseModel):
    id: UUID
    content: str
    sender_id: UUID
    created_at: datetime
    read_at: Optional[datetime] = None

class ConversationListResponse(BaseModel):
    id: UUID
    buyer_id: UUID
    seller_id: UUID
    last_product_id: Optional[UUID] = None
    created_at: datetime
    last_message_at: datetime
    other_participant: OtherParticipantInfo
    last_product: Optional[LastProductInfo] = None
    last_message: Optional[LastMessageInfo] = None
    unread_count: int

    class Config:
        from_attributes = True
