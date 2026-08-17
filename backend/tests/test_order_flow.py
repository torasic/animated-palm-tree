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
    assert order.status == OrderStatus.DITERIMA
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
    assert order.status == OrderStatus.DITERIMA
    assert order.received_at is not None

async def test_buyer_rating_after_received(test_context):
    db, buyer, seller, product = test_context
    order = await create_test_order(db, product, buyer, quantity_kg=5.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    order = await order_status_service.confirm_received(db, order, buyer)
    
    assert order.status == OrderStatus.DITERIMA
    
    from fastapi import HTTPException
    from app.services.rating_service import create_rating
    from app.models.rating import TransactionType
    
    # 1. Rating while status is still DITERIMA MUST fail with 400
    with pytest.raises(HTTPException) as exc_info:
        await create_rating(
            db=db,
            rater_id=buyer.id,
            transaction_type=TransactionType.PRODUCT_PURCHASE,
            reference_id=order.id,
            score=5,
            comment="Bagus sekali!"
        )
    assert exc_info.value.status_code == 400
    assert "Rating hanya dapat diberikan setelah transaksi benar-benar selesai." in exc_info.value.detail

    # 2. Advance order to SELESAI (e.g., after complaint timeout or completed)
    order.status = OrderStatus.SELESAI
    order.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(order)
    await db.commit()
    await db.refresh(order)

    # 3. Rating after status is SELESAI MUST succeed
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
    assert order.status == OrderStatus.DITERIMA
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
    assert order.status == OrderStatus.DITERIMA
    assert order.escrow_status == EscrowStatus.RELEASED
    assert order.disbursement_status == "pending_bank_details"

async def test_file_complaint_lifecycle(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    from app.models.order import ComplaintReason
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    
    # Simulate payment success and receipt
    order.escrow_status = EscrowStatus.HELD
    await order_status_service.confirm_received(db, order, buyer)
    await db.refresh(order)
    assert order.status == OrderStatus.DITERIMA
    
    # Call order_status_service.file_complaint from DITERIMA
    await order_status_service.file_complaint(
        db=db,
        order=order,
        current_user=buyer,
        reason=ComplaintReason.BARANG_RUSAK,
        description="Barang hancur di jalan"
    )
    
    await db.refresh(order)
    assert order.status == OrderStatus.KOMPLAIN_DIPROSES
    assert order.complaint_reason == ComplaintReason.BARANG_RUSAK
    assert order.complaint_description == "Barang hancur di jalan"
    assert order.complained_at is not None

async def test_dispute_resolution_release_seller(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    from app.models.order import ComplaintReason
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    order.escrow_status = EscrowStatus.HELD
    await order_status_service.confirm_received(db, order, buyer)
    
    # File complaint
    await order_status_service.file_complaint(
        db=db,
        order=order,
        current_user=buyer,
        reason=ComplaintReason.KUALITAS_BURUK,
        description="Kualitas tidak sesuai standar"
    )
    await db.refresh(order)
    assert order.status == OrderStatus.KOMPLAIN_DIPROSES
    
    # Resolve dispute with RELEASE_SELLER
    order, manual_req = await order_status_service.resolve_dispute(
        db=db,
        order=order,
        action="RELEASE_SELLER",
        admin_note="Barang sudah sesuai deskripsi awal."
    )
    
    await db.refresh(order)
    assert order.status == OrderStatus.SELESAI
    assert order.completed_at is not None
    assert manual_req is False

async def test_dispute_resolution_refund_buyer_escrow_held(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    from app.models.order import ComplaintReason
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    order.escrow_status = EscrowStatus.HELD
    
    # File complaint directly before confirming receipt
    await order_status_service.file_complaint(
        db=db,
        order=order,
        current_user=buyer,
        reason=ComplaintReason.BARANG_RUSAK,
        description="Barang busuk total saat tiba"
    )
    await db.refresh(order)
    assert order.status == OrderStatus.KOMPLAIN_DIPROSES
    assert order.escrow_status == EscrowStatus.DISPUTED
    
    # Resolve dispute with REFUND_BUYER
    order, manual_req = await order_status_service.resolve_dispute(
        db=db,
        order=order,
        action="REFUND_BUYER",
        admin_note="Disetujui untuk refund penuh"
    )
    
    await db.refresh(order)
    assert order.status == OrderStatus.DIBATALKAN
    assert order.escrow_status == EscrowStatus.REFUNDED
    assert manual_req is False

async def test_dispute_resolution_refund_buyer_escrow_already_released(test_context):
    db, buyer, seller, product = test_context
    from app.models.payment_transaction import EscrowStatus
    from app.models.order import ComplaintReason
    
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    order.escrow_status = EscrowStatus.HELD
    
    # Buyer confirmed -> status DITERIMA, escrow RELEASED
    await order_status_service.confirm_received(db, order, buyer)
    await db.refresh(order)
    assert order.escrow_status == EscrowStatus.RELEASED
    assert order.status == OrderStatus.DITERIMA
    
    # Buyer files complaint within window
    await order_status_service.file_complaint(
        db=db,
        order=order,
        current_user=buyer,
        reason=ComplaintReason.TIDAK_SESUAI_DESKRIPSI,
        description="Varietas salah"
    )
    await db.refresh(order)
    assert order.status == OrderStatus.KOMPLAIN_DIPROSES
    
    # Resolve dispute with REFUND_BUYER
    order, manual_req = await order_status_service.resolve_dispute(
        db=db,
        order=order,
        action="REFUND_BUYER",
        admin_note="Refund manual via admin"
    )
    
    await db.refresh(order)
    assert order.status == OrderStatus.DIBATALKAN
    assert manual_req is True  # Flagged for manual admin refund because funds were already released

async def test_resolve_dispute_invalid_status_rejected(test_context):
    db, buyer, seller, product = test_context
    order = await create_test_order(db, product, buyer, quantity_kg=10.0)
    
    with pytest.raises(HTTPException) as excinfo:
        await order_status_service.resolve_dispute(
            db=db,
            order=order,
            action="REFUND_BUYER"
        )
    assert excinfo.value.status_code == 400
    assert "KOMPLAIN_DIPROSES" in excinfo.value.detail

async def test_complaint_timeout_auto_complete(test_context):
    db, buyer, seller, product = test_context
    order = await create_test_order(db, product, buyer, quantity_kg=5.0)
    order = await order_status_service.accept_order(db, order, seller)
    order = await order_status_service.mark_order_ready(db, order, seller, OrderStatus.DIKIRIM)
    await order_status_service.confirm_received(db, order, buyer)
    
    await db.refresh(order)
    assert order.status == OrderStatus.DITERIMA
    
    # Simulate past TIMEOUT_KOMPLAIN
    order.received_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.TIMEOUT_KOMPLAIN + 10)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    
    from app.services import scheduler
    await scheduler.check_complaint_timeouts()
    
    await db.refresh(order)
    assert order.status == OrderStatus.SELESAI
    assert order.completed_at is not None





