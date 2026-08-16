import pytest
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from fastapi import HTTPException

from app.db import AsyncSessionLocal
from app.config import settings
from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.order import Order, OrderStatus, CancellationReason, ComplaintReason
from app.services import order_status_service

import pytest_asyncio

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture
async def test_context():
    # Dispose any stale connections from the previous test before opening a new session.
    # This prevents 'connection was closed' errors caused by asyncpg connection reuse
    # across event loop boundaries or after scheduler jobs open their own connections.
    from app.db import engine
    await engine.dispose()

    async with AsyncSessionLocal() as db:
        # Create Buyer
        buyer_id = uuid.uuid4()
        buyer = User(
            id=buyer_id,
            email=f"buyer_{buyer_id.hex[:6]}@test.com",
            google_sub=f"sub_{buyer_id.hex[:6]}",
            full_name="Test Buyer",
            role=UserRole.PEMBELI,
            phone_whatsapp="081234567890"
        )
        db.add(buyer)

        # Create Seller (Petani)
        seller_id = uuid.uuid4()
        seller = User(
            id=seller_id,
            email=f"seller_{seller_id.hex[:6]}@test.com",
            google_sub=f"sub_{seller_id.hex[:6]}",
            full_name="Test Seller",
            role=UserRole.PETANI,
            phone_whatsapp="089876543210"
        )
        db.add(seller)
        await db.flush()

        # Create Product
        product = Product(
            id=uuid.uuid4(),
            seller_id=seller.id,
            name="Cabe Rawit Unggul",
            category="Sayuran",
            quantity_kg=100.0,
            price_per_kg=35000.0,
            status=ProductStatus.TERSEDIA
        )
        db.add(product)
        await db.commit()
        
        try:
            yield db, buyer, seller, product
        finally:
            # Cleanup — rollback first in case the test left the session in a bad state
            from sqlalchemy import delete
            try:
                await db.rollback()
            except Exception:
                pass
            try:
                await db.execute(delete(Order).where(Order.product_id == product.id))
                await db.execute(delete(Product).where(Product.id == product.id))
                await db.execute(delete(User).where(User.id == buyer.id))
                await db.execute(delete(User).where(User.id == seller.id))
                await db.commit()
            except Exception:
                await db.rollback()
            await db.close()

async def create_test_order(db, product, buyer, quantity_kg=10.0, initial_status=OrderStatus.MENUNGGU_KONFIRMASI):
    order = Order(
        id=uuid.uuid4(),
        product_id=product.id,
        buyer_id=buyer.id,
        quantity_kg=quantity_kg,
        status=initial_status,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None)
    )
    # Deduct product stock initially
    stmt = select(Product).where(Product.id == product.id).with_for_update()
    res = await db.execute(stmt)
    db_product = res.scalar_one()
    db_product.quantity_kg -= quantity_kg
    if db_product.quantity_kg <= 0:
        db_product.status = ProductStatus.TERJUAL
    db.add(db_product)
    
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order

async def test_valid_order_flow_pickup(test_context):
    db, buyer, seller, product = test_context
    order = await create_test_order(db, product, buyer, quantity_kg=15.0)
    assert order.status == OrderStatus.MENUNGGU_KONFIRMASI
    
    order = await order_status_service.accept_order(db, order, seller)
    assert order.status == OrderStatus.DIPROSES
    
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.SIAP_DIAMBIL)
    assert order.status == OrderStatus.SIAP_DIAMBIL
    assert order.marked_ready_at is not None
    
    order = await order_status_service.confirm_received(db, order, buyer)
    assert order.status == OrderStatus.SELESAI
    assert order.buyer_confirmed_at is not None
    assert order.received_at is not None

async def test_farmer_reject_flow_and_rollback(test_context):
    db, buyer, seller, product = test_context
    res_p = await db.execute(select(Product).where(Product.id == product.id))
    product_before = res_p.scalar_one()
    stock_before = product_before.quantity_kg
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    
    await db.refresh(product_before)
    assert product_before.quantity_kg == stock_before - 10.0
    
    order = await order_status_service.reject_order(db, order, seller)
    assert order.status == OrderStatus.DIBATALKAN
    assert order.cancellation_reason == CancellationReason.PETANI_MENOLAK
    
    await db.refresh(product_before)
    assert product_before.quantity_kg == stock_before

async def test_buyer_cancel_flow_and_rollback(test_context):
    db, buyer, seller, product = test_context
    res_p = await db.execute(select(Product).where(Product.id == product.id))
    product_before = res_p.scalar_one()
    stock_before = product_before.quantity_kg
    
    order = await create_test_order(db, product, buyer, quantity_kg=5.0)
    
    order = await order_status_service.cancel_order_by_buyer(db, order, buyer)
    assert order.status == OrderStatus.DIBATALKAN
    assert order.cancellation_reason == CancellationReason.PEMBELI_BATAL
    
    await db.refresh(product_before)
    assert product_before.quantity_kg == stock_before

async def test_invalid_state_transitions(test_context):
    db, buyer, seller, product = test_context
    order = await create_test_order(db, product, buyer, quantity_kg=5.0)
    
    with pytest.raises(HTTPException) as excinfo:
        await order_status_service.mark_order_ready(db, order, seller, OrderStatus.SIAP_DIAMBIL)
    assert excinfo.value.status_code == 400
    assert "tidak valid" in excinfo.value.detail
    
    order = await order_status_service.accept_order(db, order, seller)
    with pytest.raises(HTTPException) as excinfo:
        await order_status_service.cancel_order_by_buyer(db, order, buyer)
    assert excinfo.value.status_code == 400
    assert "MENUNGGU_KONFIRMASI" in excinfo.value.detail



async def test_timeout_confirmation_job(test_context):
    db, buyer, seller, product = test_context
    res_p = await db.execute(select(Product).where(Product.id == product.id))
    product_before = res_p.scalar_one()
    stock_before = product_before.quantity_kg
    
    order = await create_test_order(db, product, buyer, quantity_kg=12.0)
    
    order.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.TIMEOUT_KONFIRMASI + 10)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    from app.services import scheduler
    await scheduler.check_confirmation_timeouts()
    
    await db.refresh(order)
    assert order.status == OrderStatus.DIBATALKAN
    assert order.cancellation_reason == CancellationReason.TIMEOUT_KONFIRMASI
    
    await db.refresh(product_before)
    assert product_before.quantity_kg == stock_before

async def test_timeout_pickup_job(test_context):
    db, buyer, seller, product = test_context
    res_p = await db.execute(select(Product).where(Product.id == product.id))
    product_before = res_p.scalar_one()
    stock_before = product_before.quantity_kg
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.SIAP_DIAMBIL)
    
    order.marked_ready_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.TIMEOUT_PENGAMBILAN + 10)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    from app.services import scheduler
    await scheduler.check_pickup_and_auto_confirm()
    
    await db.refresh(order)
    assert order.status == OrderStatus.DIBATALKAN
    assert order.cancellation_reason == CancellationReason.TIMEOUT_PENGAMBILAN
    
    await db.refresh(product_before)
    assert product_before.quantity_kg == stock_before

async def test_timeout_auto_confirm_received_job(test_context):
    db, buyer, seller, product = test_context
    order = await create_test_order(db, product, buyer, quantity_kg=5.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    
    order.marked_ready_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.TIMEOUT_AUTO_CONFIRM + 10)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    from app.services import scheduler
    await scheduler.check_pickup_and_auto_confirm()
    
    await db.refresh(order)
    assert order.status == OrderStatus.SELESAI
    assert order.received_at is not None

async def test_buyer_rating_after_received(test_context):
    db, buyer, seller, product = test_context
    order = await create_test_order(db, product, buyer, quantity_kg=5.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    order = await order_status_service.confirm_received(db, order, buyer)
    
    assert order.status == OrderStatus.SELESAI
    
    from app.services.rating_service import create_rating
    from app.models.rating import TransactionType
    
    # Rating after SELESAI should succeed
    rating = await create_rating(
        db=db,
        rater_id=buyer.id,
        transaction_type=TransactionType.PRODUCT_PURCHASE,
        reference_id=order.id,
        score=5,
        comment="Bagus sekali!"
    )
    assert rating.id is not None
    assert rating.score == 5

async def test_timeout_pickup_with_refund(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    from app.services import scheduler
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.SIAP_DIAMBIL)
    
    # Simulate payment success (escrow status HELD)
    order.escrow_status = EscrowStatus.HELD
    order.marked_ready_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.TIMEOUT_PENGAMBILAN + 10)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # Run the scheduler job
    await scheduler.check_pickup_and_auto_confirm()
    
    await db.refresh(order)
    assert order.status == OrderStatus.DIBATALKAN
    assert order.cancellation_reason == CancellationReason.TIMEOUT_PENGAMBILAN
    assert order.escrow_status == EscrowStatus.REFUNDED

async def test_timeout_auto_confirm_with_escrow_release(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    from app.services import scheduler
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    
    # Simulate payment success (escrow status HELD)
    order.escrow_status = EscrowStatus.HELD
    order.marked_ready_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.TIMEOUT_AUTO_CONFIRM + 10)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # Run the scheduler job
    await scheduler.check_pickup_and_auto_confirm()
    
    await db.refresh(order)
    assert order.status == OrderStatus.SELESAI
    assert order.escrow_status == EscrowStatus.RELEASED
    assert order.disbursement_status == "pending_bank_details"

async def test_confirm_success_with_escrow_release(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    
    # Simulate payment success (escrow status HELD)
    order.escrow_status = EscrowStatus.HELD
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # Call order_status_service.confirm_received
    await order_status_service.confirm_received(db, order, buyer)
    
    await db.refresh(order)
    assert order.status == OrderStatus.SELESAI
    assert order.escrow_status == EscrowStatus.RELEASED
    assert order.disbursement_status == "pending_bank_details"

async def test_file_complaint_lifecycle(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    from app.models.order import ComplaintReason
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    
    # Simulate payment success (escrow status HELD)
    order.escrow_status = EscrowStatus.HELD
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    # Call order_status_service.file_complaint
    await order_status_service.file_complaint(
        db=db,
        order=order,
        current_user=buyer,
        reason=ComplaintReason.BARANG_RUSAK,
        description="Barang hancur di jalan"
    )
    
    await db.refresh(order)
    assert order.status == OrderStatus.KOMPLAIN_DIPROSES
    assert order.escrow_status == EscrowStatus.DISPUTED
    assert order.complaint_reason == ComplaintReason.BARANG_RUSAK
    assert order.complaint_description == "Barang hancur di jalan"
    assert order.complained_at is not None




