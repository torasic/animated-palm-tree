from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.db import AsyncSessionLocal
from app.config import settings
from app.models.order import Order, OrderStatus
from app.models.payment_transaction import DemandTransaction, PaymentStatus
from app.services.order_status_service import (
    system_timeout_confirmation,
    system_timeout_pickup,
    system_auto_confirm_received
)

scheduler = AsyncIOScheduler()

async def check_confirmation_timeouts():
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        threshold = now - timedelta(seconds=settings.TIMEOUT_KONFIRMASI)
        stmt = select(Order).where(
            Order.status == OrderStatus.MENUNGGU_KONFIRMASI,
            Order.created_at <= threshold
        )
        res = await db.execute(stmt)
        orders = res.scalars().all()
        
        for order in orders:
            try:
                # Process each transition in its own transaction context to avoid partial commits failure
                await system_timeout_confirmation(db, order)
            except Exception as e:
                print(f"Error processing confirmation timeout for order {order.id}: {e}")

async def check_pickup_and_auto_confirm():
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        
        # 1. Process pickup timeouts first (only for SIAP_DIAMBIL)
        threshold_pickup = now - timedelta(seconds=settings.TIMEOUT_PENGAMBILAN)
        stmt_pickup = select(Order).where(
            Order.status == OrderStatus.SIAP_DIAMBIL,
            Order.marked_ready_at <= threshold_pickup
        )
        res_pickup = await db.execute(stmt_pickup)
        orders_pickup = res_pickup.scalars().all()
        
        for order in orders_pickup:
            try:
                await system_timeout_pickup(db, order)
            except Exception as e:
                print(f"Error processing pickup timeout for order {order.id}: {e}")
                
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # 2. Process auto-confirm received next (only for DIKIRIM)
        threshold_confirm = now - timedelta(seconds=settings.TIMEOUT_AUTO_CONFIRM)
        stmt_confirm = select(Order).where(
            Order.status == OrderStatus.DIKIRIM,
            Order.marked_ready_at <= threshold_confirm
        )
        res_confirm = await db.execute(stmt_confirm)
        orders_confirm = res_confirm.scalars().all()
        
        for order in orders_confirm:
            try:
                await system_auto_confirm_received(db, order)
            except Exception as e:
                print(f"Error processing auto-confirm received for order {order.id}: {e}")

async def check_demand_match_timeouts():
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        threshold = now - timedelta(seconds=settings.TIMEOUT_KONFIRMASI)
        
        stmt = (
            select(DemandTransaction)
            .where(
                DemandTransaction.payment_status == PaymentStatus.PENDING,
                DemandTransaction.created_at <= threshold
            )
        )
        res = await db.execute(stmt)
        txs = res.scalars().all()
        
        for tx in txs:
            try:
                from app.models.product import Product, ProductStatus
                from app.models.demand_request import DemandRequest, DemandRequestStatus
                
                # 1. Revert product stock
                if tx.product_id:
                    stmt_p = select(Product).where(Product.id == tx.product_id)
                    res_p = await db.execute(stmt_p)
                    product = res_p.scalar_one_or_none()
                    if product:
                        product.quantity_kg += tx.quantity_kg
                        if product.status == ProductStatus.TERJUAL and product.quantity_kg > 0:
                            product.status = ProductStatus.TERSEDIA
                        db.add(product)
                
                # 2. Revert demand request committed progress
                stmt_req = select(DemandRequest).where(DemandRequest.id == tx.demand_request_id)
                res_req = await db.execute(stmt_req)
                req = res_req.scalar_one_or_none()
                if req:
                    req.quantity_kg_committed = max(0.0, req.quantity_kg_committed - tx.quantity_kg)
                    if req.status == DemandRequestStatus.TERPENUHI and req.quantity_kg_committed < req.quantity_kg_needed:
                        req.status = DemandRequestStatus.TERBUKA
                    db.add(req)
                
                # 3. Expire transaction
                tx.payment_status = PaymentStatus.EXPIRED
                db.add(tx)
                
                await db.commit()
                
                # 4. Broadcast update
                from app.routers.demand_requests import demand_manager
                await demand_manager.broadcast(
                    str(tx.demand_request_id),
                    {
                        "demand_request_id": str(tx.demand_request_id),
                        "quantity_kg_committed": req.quantity_kg_committed if req else 0.0,
                        "status": req.status.value if req else "TERBUKA",
                        "payment_status": tx.payment_status.value,
                        "escrow_status": tx.escrow_status.value,
                        "message": f"Transaksi pencocokan {tx.id.hex[:6]} kedaluwarsa karena tidak dibayar tepat waktu.",
                        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
                    }
                )
            except Exception as e:
                print(f"Error processing demand transaction timeout for {tx.id}: {e}")
                await db.rollback()

def start_scheduler():
    scheduler.add_job(check_confirmation_timeouts, 'interval', seconds=30, id='check_confirmation_timeouts', replace_existing=True)
    scheduler.add_job(check_pickup_and_auto_confirm, 'interval', seconds=30, id='check_pickup_and_auto_confirm', replace_existing=True)
    scheduler.add_job(check_demand_match_timeouts, 'interval', seconds=30, id='check_demand_match_timeouts', replace_existing=True)
    scheduler.start()
    print("APScheduler started successfully.")

def shutdown_scheduler():
    scheduler.shutdown()
    print("APScheduler shut down successfully.")
