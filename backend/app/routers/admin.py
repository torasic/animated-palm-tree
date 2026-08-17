from fastapi import APIRouter, Depends, HTTPException, Query, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import aliased
from typing import Optional, List
from uuid import UUID
from datetime import datetime, timezone
from pydantic import BaseModel

from app.db import get_db
from app.models.scraper_status import ScraperStatus
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.user import User, UserRole
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.rating import Rating, TransactionType
from app.schemas.order import OrderResponse, OrderDisputeResolve
from app.services import auth_service
from app.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/scraper-status")
async def get_admin_scraper_status(
    token: Optional[str] = Query(None, description="Admin verification token"),
    db: AsyncSession = Depends(get_db)
):
    if not token or token != settings.ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized admin token"
        )
    result = await db.execute(
        select(ScraperStatus).order_by(ScraperStatus.last_run_at.desc()).limit(1)
    )
    latest_run = result.scalar_one_or_none()
    
    if not latest_run:
        return {
            "last_run": None,
            "status": "idle",
            "last_error": None,
            "items_scraped": 0
        }
        
    return {
        "last_run": latest_run.last_run_at.isoformat(),
        "status": latest_run.status.value,
        "last_error": latest_run.error_message,
        "items_scraped": latest_run.items_scraped
    }

def is_admin_user(user: User) -> bool:
    import os
    admin_emails_set = set()
    if getattr(settings, "ADMIN_EMAIL", None):
        for e in settings.ADMIN_EMAIL.split(","):
            if e.strip():
                admin_emails_set.add(e.strip().lower())
    
    env_val = os.environ.get("ADMIN_EMAIL")
    if env_val:
        for e in env_val.split(","):
            if e.strip():
                admin_emails_set.add(e.strip().lower())

    try:
        from app.config import env_file_path
        if os.path.exists(env_file_path):
            with open(env_file_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("ADMIN_EMAIL="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        for e in val.split(","):
                            if e.strip():
                                admin_emails_set.add(e.strip().lower())
    except Exception:
        pass

    return user.email.lower() in admin_emails_set or (user.role and user.role.value == "ADMIN")

@router.get("/disputes", response_model=List[OrderResponse])
async def list_admin_disputes(
    status_filter: Optional[str] = Query(None, description="Filter: 'pending', 'all'"),
    current_user: User = Depends(auth_service.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Hanya akun Administrator yang diizinkan mengakses panel ini."
        )

    BuyerUser = aliased(User, name="buyer")
    SellerUser = aliased(User, name="seller")

    has_buyer_rated_sub = (
        select(func.count(Rating.id))
        .where(
            Rating.reference_id == Order.id,
            Rating.transaction_type == TransactionType.PRODUCT_PURCHASE,
            Rating.rater_id == Order.buyer_id
        )
        .scalar_subquery() > 0
    ).label("has_buyer_rated")

    stmt = (
        select(
            Order,
            Product.name.label("product_name"),
            Product.photo_url.label("product_photo_url"),
            Product.price_per_kg.label("price_per_kg"),
            BuyerUser.full_name.label("buyer_name"),
            BuyerUser.phone_whatsapp.label("buyer_phone"),
            SellerUser.full_name.label("seller_name"),
            SellerUser.phone_whatsapp.label("seller_phone"),
            Product.seller_id.label("seller_id"),
            has_buyer_rated_sub
        )
        .join(Product, Order.product_id == Product.id)
        .join(BuyerUser, Order.buyer_id == BuyerUser.id)
        .join(SellerUser, Product.seller_id == SellerUser.id)
    )

    if status_filter == "pending":
        stmt = stmt.where(Order.status.in_([OrderStatus.KOMPLAIN_DIPROSES, OrderStatus.MASA_KOMPLAIN]))
    else:
        stmt = stmt.where(
            or_(
                Order.status.in_([OrderStatus.KOMPLAIN_DIPROSES, OrderStatus.MASA_KOMPLAIN]),
                Order.complaint_reason.isnot(None),
                Order.complained_at.isnot(None)
            )
        )

    stmt = stmt.order_by(Order.complained_at.desc().nullslast(), Order.created_at.desc())

    result = await db.execute(stmt)
    orders_data = []
    for row in result:
        order = row.Order
        orders_data.append(OrderResponse(
            id=order.id,
            product_id=order.product_id,
            buyer_id=order.buyer_id,
            quantity_kg=order.quantity_kg,
            status=order.status,
            buyer_confirmed_at=order.buyer_confirmed_at,
            created_at=order.created_at,
            product_name=row.product_name,
            product_photo_url=row.product_photo_url,
            price_per_kg=row.price_per_kg,
            buyer_name=row.buyer_name,
            buyer_phone=row.buyer_phone,
            seller_name=row.seller_name,
            seller_phone=row.seller_phone,
            seller_id=row.seller_id,
            has_buyer_rated=row.has_buyer_rated,
            cancellation_reason=order.cancellation_reason,
            complaint_reason=order.complaint_reason,
            complaint_description=order.complaint_description,
            complained_at=order.complained_at,
            completed_at=order.completed_at,
            payment_status=order.payment_status.value if order.payment_status else None,
            escrow_status=order.escrow_status.value if order.escrow_status else None,
            xendit_invoice_id=order.xendit_invoice_id,
            xendit_invoice_url=order.xendit_invoice_url,
            xendit_external_id=order.xendit_external_id,
            paid_at=order.paid_at,
            confirmed_received_at=order.confirmed_received_at,
            released_at=order.released_at
        ))
    return orders_data
