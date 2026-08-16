from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import aliased
from typing import List, Optional
from uuid import UUID

from app.db import get_db
from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.order import Order, OrderStatus, CancellationReason, ComplaintReason
from app.models.rating import Rating, TransactionType
from app.services import auth_service, connection_manager
from app.services.escrow_service import escrow_service
from datetime import datetime
from app.schemas.order import OrderCreate, OrderResponse, OrderComplaint

router = APIRouter(prefix="/orders", tags=["orders"])

async def get_full_order_response(db: AsyncSession, order_id: UUID) -> OrderResponse:
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

    stmt_full = (
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
        .where(Order.id == order_id)
    )
    
    res_full = await db.execute(stmt_full)
    row = res_full.first()
    if not row:
        raise HTTPException(status_code=404, detail="Order details not found")
        
    return OrderResponse(
        id=row.Order.id,
        product_id=row.Order.product_id,
        buyer_id=row.Order.buyer_id,
        quantity_kg=row.Order.quantity_kg,
        status=row.Order.status,
        buyer_confirmed_at=row.Order.buyer_confirmed_at,
        created_at=row.Order.created_at,
        product_name=row.product_name,
        product_photo_url=row.product_photo_url,
        price_per_kg=row.price_per_kg,
        buyer_name=row.buyer_name,
        buyer_phone=row.buyer_phone,
        seller_name=row.seller_name,
        seller_phone=row.seller_phone,
        seller_id=row.seller_id,
        has_buyer_rated=row.has_buyer_rated,
        cancellation_reason=row.Order.cancellation_reason,
        payment_status=row.Order.payment_status.value if row.Order.payment_status else None,
        escrow_status=row.Order.escrow_status.value if row.Order.escrow_status else None,
        xendit_invoice_id=row.Order.xendit_invoice_id,
        xendit_invoice_url=row.Order.xendit_invoice_url,
        xendit_external_id=row.Order.xendit_external_id,
        paid_at=row.Order.paid_at,
        confirmed_received_at=row.Order.confirmed_received_at,
        released_at=row.Order.released_at
    )

@router.post("", response_model=OrderResponse)
async def create_order(
    order_data: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    # 1. Validation: Quantity must be greater than 0
    if order_data.quantity_kg <= 0:
        raise HTTPException(
            status_code=400,
            detail="Jumlah pesanan tidak valid"
        )
        
    # 2. Get product with SELECT FOR UPDATE to prevent race conditions
    result = await db.execute(
        select(Product)
        .where(Product.id == order_data.product_id)
        .with_for_update()
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    # Check if buying own product
    if product.seller_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anda tidak dapat membeli produk milik sendiri"
        )
        
    # 3. Check if product is available
    if product.status != ProductStatus.TERSEDIA:
        raise HTTPException(
            status_code=400,
            detail="Produk sudah tidak tersedia"
        )
        
    # 4. Check if quantity exceeds stock
    if product.quantity_kg < order_data.quantity_kg:
        raise HTTPException(
            status_code=400,
            detail="Jumlah melebihi stok tersedia"
        )
        
    # 5. Deduct stock
    product.quantity_kg -= order_data.quantity_kg
    if product.quantity_kg <= 0:
        product.quantity_kg = 0.0
        product.status = ProductStatus.TERJUAL
        
    # 6. Create order
    new_order = Order(
        product_id=order_data.product_id,
        buyer_id=current_user.id,
        quantity_kg=order_data.quantity_kg,
        status=OrderStatus.MENUNGGU_KONFIRMASI
    )
    db.add(new_order)
    await db.commit()
    await db.refresh(new_order)
    
    # Broadcast order creation via WS
    from app.services import order_status_service
    countdown_msg = order_status_service.get_countdown_message(OrderStatus.MENUNGGU_KONFIRMASI, new_order.created_at)
    ws_msg = f"Pesanan dibuat. {countdown_msg}" if countdown_msg else "Pesanan dibuat."
    await order_status_service.broadcast_status_change(new_order, ws_msg)
    
    return await get_full_order_response(db, new_order.id)

@router.get("", response_model=List[OrderResponse])
async def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
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
        .where(
            or_(
                Order.buyer_id == current_user.id,
                Product.seller_id == current_user.id
            )
        )
        .order_by(Order.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    
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

@router.get("/incoming", response_model=List[OrderResponse])
async def list_incoming_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    if current_user.role != UserRole.PETANI:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya petani/peternak yang dapat melihat pesanan masuk"
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
        .where(Product.seller_id == current_user.id)
        .order_by(Order.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    
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

@router.get("/my-purchases", response_model=List[OrderResponse])
async def list_my_purchases(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
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
        .where(Order.buyer_id == current_user.id)
        .order_by(Order.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    
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


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: UUID,
    status: OrderStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    stmt = select(Order).where(Order.id == order_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    from app.services import order_status_service
    
    if order.status == OrderStatus.MENUNGGU_KONFIRMASI and status == OrderStatus.DIPROSES:
        order = await order_status_service.accept_order(db, order, current_user)
    elif order.status == OrderStatus.MENUNGGU_KONFIRMASI and status == OrderStatus.DIBATALKAN:
        res_p = await db.execute(select(Product).where(Product.id == order.product_id))
        product = res_p.scalar_one()
        
        if current_user.id == product.seller_id:
            order = await order_status_service.reject_order(db, order, current_user)
        elif current_user.id == order.buyer_id:
            order = await order_status_service.cancel_order_by_buyer(db, order, current_user)
        else:
            raise HTTPException(status_code=403, detail="Otorisasi tidak valid untuk pembatalan pesanan")
    elif order.status == OrderStatus.DIPROSES and status in (OrderStatus.SIAP_DIAMBIL, OrderStatus.DIKIRIM):
        order = await order_status_service.mark_order_ready(db, order, current_user, status)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Transisi dari {order.status.value} ke {status.value} tidak diizinkan melalui endpoint ini"
        )
        
    return await get_full_order_response(db, order.id)


@router.patch("/{order_id}/confirm-success", response_model=OrderResponse)
async def confirm_order_success(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    stmt = select(Order).where(Order.id == order_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
        
    if order.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Hanya pembeli yang dapat mengonfirmasi keberhasilan transaksi")
    
    from app.services import order_status_service
    await order_status_service.confirm_received(db, order, current_user)
    
    return await get_full_order_response(db, order.id)


@router.post("/{order_id}/komplain", response_model=OrderResponse)
async def complain_order(
    order_id: UUID,
    complaint_data: OrderComplaint,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    stmt = select(Order).where(Order.id == order_id)
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
        
    from app.services import order_status_service
    await order_status_service.file_complaint(
        db, order, current_user, complaint_data.reason, complaint_data.description
    )
    
    return await get_full_order_response(db, order.id)


@router.post("/{order_id}/checkout")
async def checkout_order(
    order_id: UUID,
    success_redirect_url: str = Query(..., description="Frontend success redirect URL"),
    failure_redirect_url: str = Query(..., description="Frontend failure redirect URL"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Creates a Xendit Invoice for checkout of a standard order.
    """
    # Fetch order
    stmt = select(Order).where(Order.id == order_id)
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")

    if order.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Hanya pembeli order ini yang dapat melakukan checkout")

    # Call Escrow Service to process checkout
    invoice_url = await escrow_service.checkout_transaction(
        db=db,
        source_type="pesanan",
        source_id=order_id,
        buyer_email=current_user.email,
        success_redirect_url=success_redirect_url,
        failure_redirect_url=failure_redirect_url
    )
    return {"invoice_url": invoice_url}


@router.post("/{order_id}/confirm-received", response_model=OrderResponse)
async def confirm_order_received(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Confirm arrival of products and release escrow funds.
    """
    await escrow_service.confirm_received_and_release(
        db=db,
        source_type="pesanan",
        source_id=order_id,
        user_id=current_user.id
    )
    return await get_full_order_response(db, order_id)


@router.post("/{order_id}/dispute", response_model=OrderResponse)
async def dispute_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    File an escrow dispute for the order.
    """
    await escrow_service.dispute_transaction(
        db=db,
        source_type="pesanan",
        source_id=order_id,
        user_id=current_user.id
    )
    return await get_full_order_response(db, order_id)


@router.post("/{order_id}/disburse", response_model=OrderResponse)
async def disburse_order_escrow(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Manually triggers/retries the Xendit disbursement payout for the farmer.
    """
    await escrow_service.trigger_disbursement(
        db=db,
        source_type="pesanan",
        source_id=order_id,
        user_id=current_user.id
    )
    return await get_full_order_response(db, order_id)


