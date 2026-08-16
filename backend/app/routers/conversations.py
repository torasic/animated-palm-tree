from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from typing import List

from app.db import get_db
from app.models import User, Product, Conversation, Message
from app.services import auth_service
from app.schemas.conversation import (
    ConversationCreate,
    ConversationCreateResponse,
    ConversationListResponse,
    OtherParticipantInfo,
    LastProductInfo,
    LastMessageInfo
)

router = APIRouter(prefix="/conversations", tags=["conversations"])

@router.post("", response_model=ConversationCreateResponse)
async def create_conversation(
    body: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    target_seller_id = None
    target_buyer_id = None
    target_product_id = body.product_id

    if body.product_id:
        # Fetch product details
        product_result = await db.execute(select(Product).where(Product.id == body.product_id))
        product = product_result.scalar_one_or_none()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Product not found"
            )
        
        # If the current user is the owner (seller) of the product,
        # they must specify the buyer they want to chat with.
        if product.seller_id == current_user.id:
            if not body.buyer_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Buyer ID must be provided when seller starts a conversation"
                )
            # Verify the buyer exists
            buyer_result = await db.execute(select(User).where(User.id == body.buyer_id))
            buyer = buyer_result.scalar_one_or_none()
            if not buyer:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Buyer not found"
                )
            target_buyer_id = buyer.id
            target_seller_id = current_user.id
        else:
            target_seller_id = product.seller_id
            target_buyer_id = current_user.id
    elif body.seller_id:
        # Check if seller exists and is a farmer
        seller_result = await db.execute(select(User).where(User.id == body.seller_id))
        seller = seller_result.scalar_one_or_none()
        if not seller:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Seller not found"
            )
        if seller.role != 'PETANI':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipient must be a farmer/livestock breeder"
            )
        target_seller_id = seller.id
        target_buyer_id = current_user.id
    elif body.buyer_id:
        # Check if buyer exists
        buyer_result = await db.execute(select(User).where(User.id == body.buyer_id))
        buyer = buyer_result.scalar_one_or_none()
        if not buyer:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Buyer not found"
            )
        target_buyer_id = buyer.id
        target_seller_id = current_user.id
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either product_id, seller_id, or buyer_id must be provided"
        )
    
    # User cannot start conversation with themselves
    if target_buyer_id == target_seller_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Cannot start a conversation with yourself"
        )
    
    # Check if a conversation between this buyer and seller already exists
    stmt = select(Conversation).where(
        (Conversation.buyer_id == target_buyer_id) & 
        (Conversation.seller_id == target_seller_id)
    )
    result = await db.execute(stmt)
    existing_conv = result.scalar_one_or_none()
    
    if existing_conv:
        # Update last_product_id for the thread context if product_id is provided
        if target_product_id:
            existing_conv.last_product_id = target_product_id
            await db.commit()
            await db.refresh(existing_conv)
        return ConversationCreateResponse(conversation_id=existing_conv.id)
    
    # Otherwise, create a new conversation thread
    new_conv = Conversation(
        buyer_id=target_buyer_id,
        seller_id=target_seller_id,
        last_product_id=target_product_id
    )
    db.add(new_conv)
    await db.commit()
    await db.refresh(new_conv)
    
    return ConversationCreateResponse(conversation_id=new_conv.id)

@router.get("", response_model=List[ConversationListResponse])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    # Fetch all conversations where current_user is buyer or seller
    stmt = select(Conversation).where(
        (Conversation.buyer_id == current_user.id) | 
        (Conversation.seller_id == current_user.id)
    ).order_by(Conversation.last_message_at.desc())
    
    result = await db.execute(stmt)
    conversations = result.scalars().all()
    
    if not conversations:
        return []
    
    # Extract IDs for batched queries
    conversation_ids = [c.id for c in conversations]
    other_user_ids = {
        c.seller_id if c.buyer_id == current_user.id else c.buyer_id 
        for c in conversations
    }
    last_product_ids = {
        c.last_product_id for c in conversations if c.last_product_id is not None
    }
    
    # Batch query users
    users_stmt = select(User).where(User.id.in_(other_user_ids))
    users_result = await db.execute(users_stmt)
    users_dict = {u.id: u for u in users_result.scalars().all()}
    
    # Batch query products
    products_dict = {}
    if last_product_ids:
        products_stmt = select(Product).where(Product.id.in_(last_product_ids))
        products_result = await db.execute(products_stmt)
        products_dict = {p.id: p for p in products_result.scalars().all()}
        
    # Batch query unread counts (where sender_id != current_user and read_at is null)
    unread_stmt = select(
        Message.conversation_id,
        func.count(Message.id).label("count")
    ).where(
        (Message.conversation_id.in_(conversation_ids)) &
        (Message.sender_id != current_user.id) &
        (Message.read_at.is_(None))
    ).group_by(Message.conversation_id)
    unread_result = await db.execute(unread_stmt)
    unread_dict = {row[0]: row[1] for row in unread_result.all()}
    
    # Batch query the last message for each conversation using rank window function
    subq = select(
        Message.id,
        Message.conversation_id,
        Message.content,
        Message.sender_id,
        Message.created_at,
        Message.read_at,
        func.row_number().over(
            partition_by=Message.conversation_id,
            order_by=Message.created_at.desc()
        ).label("rn")
    ).where(Message.conversation_id.in_(conversation_ids)).subquery()
    
    last_msgs_stmt = select(subq).where(subq.c.rn == 1)
    last_msgs_result = await db.execute(last_msgs_stmt)
    last_msgs_dict = {row.conversation_id: row for row in last_msgs_result.all()}
    
    response = []
    for c in conversations:
        other_user_id = c.seller_id if c.buyer_id == current_user.id else c.buyer_id
        other_user = users_dict.get(other_user_id)
        
        # Format other participant info
        other_info = OtherParticipantInfo(
            id=other_user.id,
            full_name=other_user.full_name,
            avatar_url=other_user.avatar_url,
            role=other_user.role.value if other_user.role else None
        ) if other_user else OtherParticipantInfo(
            id=other_user_id,
            full_name="Pengguna Grove",
            avatar_url=None,
            role=None
        )
        
        # Format product preview info
        prod_info = None
        if c.last_product_id:
            prod = products_dict.get(c.last_product_id)
            if prod:
                prod_info = LastProductInfo(
                    id=prod.id,
                    name=prod.name,
                    photo_url=prod.photo_url
                )
                
        # Format last message info
        msg_info = None
        last_msg = last_msgs_dict.get(c.id)
        if last_msg:
            msg_info = LastMessageInfo(
                id=last_msg.id,
                content=last_msg.content,
                sender_id=last_msg.sender_id,
                created_at=last_msg.created_at,
                read_at=last_msg.read_at
            )
            
        unread_count = unread_dict.get(c.id, 0)
        
        response.append(
            ConversationListResponse(
                id=c.id,
                buyer_id=c.buyer_id,
                seller_id=c.seller_id,
                last_product_id=c.last_product_id,
                created_at=c.created_at,
                last_message_at=c.last_message_at,
                other_participant=other_info,
                last_product=prod_info,
                last_message=msg_info,
                unread_count=unread_count
            )
        )
        
    return response
