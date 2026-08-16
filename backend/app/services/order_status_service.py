from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.order import Order, OrderStatus, CancellationReason, ComplaintReason
from app.models.product import Product, ProductStatus
from app.models.user import User
from app.services.connection_manager import manager

# Helper for WebSocket broadcasts
async def broadcast_status_change(order: Order, message_text: str):
    await manager.broadcast_to_order(
        str(order.id),
        {
            "order_id": str(order.id),
            "status": order.status.value,
            "message": message_text,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        }
    )

def get_countdown_message(target_status: OrderStatus, base_time: datetime) -> str:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    if target_status == OrderStatus.MENUNGGU_KONFIRMASI:
        deadline = base_time + timedelta(seconds=settings.TIMEOUT_KONFIRMASI)
    elif target_status == OrderStatus.SIAP_DIAMBIL:
        deadline = base_time + timedelta(seconds=settings.TIMEOUT_PENGAMBILAN)
    elif target_status == OrderStatus.DIKIRIM:
        deadline = base_time + timedelta(seconds=settings.TIMEOUT_AUTO_CONFIRM)
    else:
        return ""
        
    diff = deadline - now
    if diff.total_seconds() <= 0:
        return ""
        
    days = diff.days
    hours = diff.seconds // 3600
    minutes = (diff.seconds % 3600) // 60
    
    time_str = f"{hours} jam {minutes} menit" if days == 0 else f"{days} hari {hours} jam"
    
    if target_status == OrderStatus.MENUNGGU_KONFIRMASI:
        return f"Sisa waktu konfirmasi petani/peternak: {time_str}"
    elif target_status == OrderStatus.SIAP_DIAMBIL:
        return f"Sisa waktu ambil barang: {time_str}"
    elif target_status == OrderStatus.DIKIRIM:
        return f"Sisa waktu konfirmasi penerimaan: {time_str}"
        
    return ""

async def rollback_stock(db: AsyncSession, order: Order):
    """
    Rollback stock of product. Product is queried with SELECT FOR UPDATE to prevent race conditions.
    """
    stmt = select(Product).where(Product.id == order.product_id).with_for_update()
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Produk terkait order tidak ditemukan saat rollback stock"
        )
    
    product.quantity_kg += order.quantity_kg
    if product.status == ProductStatus.TERJUAL:
        product.status = ProductStatus.TERSEDIA
        
    db.add(product)

# Transition 1: Accept Order (Farmer)
async def accept_order(db: AsyncSession, order: Order, current_user: User) -> Order:
    # 1. Validate sequence
    if order.status != OrderStatus.MENUNGGU_KONFIRMASI:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transisi dari {order.status.value} ke DIPROSES tidak valid"
        )
        
    # 2. Validate auth
    stmt = select(Product).where(Product.id == order.product_id)
    res = await db.execute(stmt)
    product = res.scalar_one()
    if product.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya petani/peternak pemilik produk yang dapat menerima pesanan"
        )
        
    order.status = OrderStatus.DIPROSES
    order.status_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    await broadcast_status_change(order, "Pesanan diterima oleh petani/peternak dan sedang diproses.")
    return order

# Transition 2: Reject Order (Farmer)
async def reject_order(db: AsyncSession, order: Order, current_user: User) -> Order:
    # 1. Validate sequence
    if order.status != OrderStatus.MENUNGGU_KONFIRMASI:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transisi dari {order.status.value} ke DIBATALKAN tidak valid"
        )
        
    # 2. Validate auth
    stmt = select(Product).where(Product.id == order.product_id)
    res = await db.execute(stmt)
    product = res.scalar_one()
    if product.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya petani/peternak pemilik produk yang dapat menolak pesanan"
        )
        
    # Rollback stock and update status in one transaction
    await rollback_stock(db, order)
    
    order.status = OrderStatus.DIBATALKAN
    order.cancellation_reason = CancellationReason.PETANI_MENOLAK
    order.status_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    await broadcast_status_change(order, "Pesanan ditolak oleh petani/peternak. Status: DIBATALKAN.")
    return order

# Transition 3: Cancel by Buyer
async def cancel_order_by_buyer(db: AsyncSession, order: Order, current_user: User) -> Order:
    # 1. Validate sequence
    if order.status != OrderStatus.MENUNGGU_KONFIRMASI:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pesanan hanya dapat dibatalkan pembeli saat status MENUNGGU_KONFIRMASI"
        )
        
    # 2. Validate auth
    if order.buyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembeli yang dapat membatalkan pesanan ini"
        )
        
    # Rollback stock and update status in one transaction
    await rollback_stock(db, order)
    
    order.status = OrderStatus.DIBATALKAN
    order.cancellation_reason = CancellationReason.PEMBELI_BATAL
    order.status_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    await broadcast_status_change(order, "Pesanan dibatalkan oleh pembeli. Status: DIBATALKAN.")
    return order

# Transition 4: Mark Order Ready (Farmer)
async def mark_order_ready(db: AsyncSession, order: Order, current_user: User, target_status: OrderStatus) -> Order:
    # 1. Validate sequence
    if order.status != OrderStatus.DIPROSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transisi dari {order.status.value} ke {target_status.value} tidak valid"
        )
        
    if target_status not in (OrderStatus.SIAP_DIAMBIL, OrderStatus.DIKIRIM):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status tujuan setelah DIPROSES harus SIAP_DIAMBIL atau DIKIRIM"
        )
        
    # 2. Validate auth
    stmt = select(Product).where(Product.id == order.product_id)
    res = await db.execute(stmt)
    product = res.scalar_one()
    if product.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya petani/peternak pemilik produk yang dapat menandai pesanan siap"
        )
        
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    order.status = target_status
    order.marked_ready_at = now
    order.status_updated_at = now
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # Calculate countdown message
    countdown_msg = get_countdown_message(target_status, now)
    ws_msg = f"Pesanan siap. {countdown_msg}" if countdown_msg else "Pesanan siap."
    await broadcast_status_change(order, ws_msg)
    
    return order

# Transition 5: Confirm Received (Buyer)
async def confirm_received(db: AsyncSession, order: Order, current_user: User) -> Order:
    # 1. Validate sequence
    if order.status not in (OrderStatus.SIAP_DIAMBIL, OrderStatus.DIKIRIM):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pesanan hanya dapat diterima saat status SIAP_DIAMBIL atau DIKIRIM"
        )
        
    # 2. Validate auth
    if order.buyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembeli yang dapat mengonfirmasi pesanan diterima"
        )
        
    from app.models.payment_transaction import EscrowStatus
    
    if order.escrow_status == EscrowStatus.HELD:
        from app.services.escrow_service import escrow_service
        # Delegate to escrow service to release funds to the seller (it will also set status to SELESAI, commit and broadcast)
        await escrow_service.confirm_received_and_release(
            db=db,
            source_type="pesanan",
            source_id=order.id,
            user_id=current_user.id
        )
        await db.refresh(order)
    else:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        
        # Transition to DITERIMA transiently
        order.status = OrderStatus.DITERIMA
        order.buyer_confirmed_at = now
        order.received_at = now
        order.status_updated_at = now
        db.add(order)
        
        # Broadcast DITERIMA
        await broadcast_status_change(order, "Pesanan dikonfirmasi diterima oleh pembeli.")
        
        # Transition automatically to SELESAI
        order.status = OrderStatus.SELESAI
        order.completed_at = now
        order.status_updated_at = now
        db.add(order)
        
        await db.commit()
        await db.refresh(order)
        
        await broadcast_status_change(order, "Pesanan selesai. Status: SELESAI.")
    return order


# --- System / Scheduler Transitions ---

# Timeout 1: Confirmation Timeout
async def system_timeout_confirmation(db: AsyncSession, order: Order) -> Order:
    if order.status != OrderStatus.MENUNGGU_KONFIRMASI:
        return order
        
    await rollback_stock(db, order)
    
    order.status = OrderStatus.DIBATALKAN
    order.cancellation_reason = CancellationReason.TIMEOUT_KONFIRMASI
    order.status_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    await broadcast_status_change(order, "Pesanan dibatalkan otomatis karena petani/peternak tidak merespons dalam 24 jam. Status: DIBATALKAN.")
    return order

# Timeout 2: Pickup/Delivery Timeout
async def system_timeout_pickup(db: AsyncSession, order: Order) -> Order:
    if order.status not in (OrderStatus.SIAP_DIAMBIL, OrderStatus.DIKIRIM):
        return order
        
    await rollback_stock(db, order)
    
    from app.models.payment_transaction import EscrowStatus
    # Process refund if payment was HELD in escrow
    if order.escrow_status == EscrowStatus.HELD:
        order.escrow_status = EscrowStatus.REFUNDED
        
    order.status = OrderStatus.DIBATALKAN
    order.cancellation_reason = CancellationReason.TIMEOUT_PENGAMBILAN
    order.status_updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    msg = "Pesanan dibatalkan otomatis karena tidak diambil tepat waktu. Status: DIBATALKAN. Dana dikembalikan ke pembeli." if order.escrow_status == EscrowStatus.REFUNDED else "Pesanan dibatalkan otomatis karena tidak diambil tepat waktu. Status: DIBATALKAN."
    await broadcast_status_change(order, msg)
    return order

# Timeout 3: Auto Confirm Received (enters DITERIMA then MASA_KOMPLAIN)
async def system_auto_confirm_received(db: AsyncSession, order: Order) -> Order:
    if order.status not in (OrderStatus.SIAP_DIAMBIL, OrderStatus.DIKIRIM):
        return order
        
    from app.models.payment_transaction import EscrowStatus
    
    if order.escrow_status == EscrowStatus.HELD:
        from app.services.escrow_service import escrow_service
        # Delegate to escrow service to release funds to the seller (it will also set status to SELESAI, commit and broadcast)
        await escrow_service.confirm_received_and_release(
            db=db,
            source_type="pesanan",
            source_id=order.id,
            user_id=order.buyer_id
        )
        await db.refresh(order)
    else:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        
        order.status = OrderStatus.DITERIMA
        order.received_at = now
        order.status_updated_at = now
        db.add(order)
        
        await broadcast_status_change(order, "Pesanan otomatis dikonfirmasi diterima oleh sistem.")
        
        order.status = OrderStatus.SELESAI
        order.completed_at = now
        order.status_updated_at = now
        db.add(order)
        
        await db.commit()
        await db.refresh(order)
        
        await broadcast_status_change(order, "Pesanan selesai. Status: SELESAI.")
    return order


# Transition 6: File Complaint (Buyer)
async def file_complaint(
    db: AsyncSession,
    order: Order,
    current_user: User,
    reason: ComplaintReason,
    description: str
) -> Order:
    # 1. Validate auth
    if order.buyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembeli yang dapat mengajukan komplain"
        )
        
    # 2. Validate escrow status
    from app.models.payment_transaction import EscrowStatus
    if order.escrow_status != EscrowStatus.HELD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Komplain hanya dapat diajukan jika dana masih ditahan di escrow (status HELD)"
        )
        
    # 3. Update order fields
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    order.status = OrderStatus.KOMPLAIN_DIPROSES
    order.complaint_reason = reason
    order.complaint_description = description
    order.complained_at = now
    order.status_updated_at = now
    
    # Put escrow in DISPUTED status
    order.escrow_status = EscrowStatus.DISPUTED
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # Broadcast to frontend
    await broadcast_status_change(
        order,
        f"Pembeli mengajukan komplain: {reason.value}. Deskripsi: {description}"
    )
    return order

