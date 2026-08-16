import pytest
import pytest_asyncio
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete
from httpx import AsyncClient
import httpx
from unittest.mock import patch, AsyncMock

from app.db import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.order import Order, OrderStatus
from app.models.demand_request import DemandRequest, DemandRequestStatus, SupplyCommitment
from app.models.payment_transaction import DemandTransaction, PaymentStatus, EscrowStatus
from app.services import auth_service
from app.services.order_status_service import system_timeout_pickup, system_timeout_confirmation
from app.services.scheduler import check_expired_demand_requests
from main import app

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture
async def test_fixes_context():
    from app.db import engine
    await engine.dispose()

    async with AsyncSessionLocal() as db:
        # Buyer
        buyer_id = uuid.uuid4()
        buyer = User(
            id=buyer_id,
            email=f"buyer_fixes_{buyer_id.hex[:6]}@test.com",
            google_sub=f"sub_{buyer_id.hex[:6]}",
            full_name="Fix Buyer",
            role=UserRole.PEMBELI,
            phone_whatsapp="081234567890"
        )
        db.add(buyer)

        # Farmer
        farmer_id = uuid.uuid4()
        farmer = User(
            id=farmer_id,
            email=f"farmer_fixes_{farmer_id.hex[:6]}@test.com",
            google_sub=f"sub_{farmer_id.hex[:6]}",
            full_name="Fix Farmer",
            role=UserRole.PETANI,
            phone_whatsapp="089876543210",
            bank_name="BCA",
            bank_account_number="1234567890",
            bank_account_holder="Fix Farmer"
        )
        db.add(farmer)
        await db.flush()

        # Product
        prod_id = uuid.uuid4()
        product = Product(
            id=prod_id,
            seller_id=farmer.id,
            name="Cabai Merah Fix",
            category="Sayuran",
            price_per_kg=50000.0,
            quantity_kg=100.0,
            status=ProductStatus.TERSEDIA
        )
        db.add(product)

        # Demand Request
        demand = DemandRequest(
            id=uuid.uuid4(),
            buyer_id=buyer.id,
            commodity_name="Cabai Merah",
            category="Sayuran",
            quantity_kg_needed=100.0,
            quantity_kg_committed=0.0,
            price_per_kg=50000.0,
            deadline=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=5),
            status=DemandRequestStatus.TERBUKA
        )
        db.add(demand)
        await db.commit()

        try:
            yield db, buyer, farmer, product, demand
        finally:
            try:
                await db.rollback()
            except Exception:
                pass
            try:
                await db.execute(delete(DemandTransaction).where(DemandTransaction.demand_request_id == demand.id))
                await db.execute(delete(SupplyCommitment).where(SupplyCommitment.demand_request_id == demand.id))
                await db.execute(delete(DemandRequest).where(DemandRequest.id == demand.id))
                await db.execute(delete(Order).where(Order.buyer_id == buyer.id))
                await db.execute(delete(Product).where(Product.id == product.id))
                await db.execute(delete(User).where(User.id.in_([buyer.id, farmer.id])))
                await db.commit()
            except Exception:
                await db.rollback()
            await db.close()

# Test Bug 1 & 2: Farmer Commitment updates quantity_kg_committed and creates DemandTransaction
async def test_demand_commit_and_transaction_creation(test_fixes_context):
    db, buyer, farmer, product, demand = test_fixes_context

    app.dependency_overrides[auth_service.get_current_user] = lambda: farmer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.post(f"/demand-requests/{demand.id}/commit", json={"quantity_kg": 60.0})

    assert res.status_code == 200
    res_data = res.json()
    assert res_data["quantity_kg_committed"] == 60.0

    # Verify demand request quantity_kg_committed in DB
    await db.refresh(demand)
    assert demand.quantity_kg_committed == 60.0
    assert demand.status == DemandRequestStatus.TERBUKA

    # Verify DemandTransaction was created for payment checkout
    stmt_tx = select(DemandTransaction).where(DemandTransaction.demand_request_id == demand.id)
    res_tx = await db.execute(stmt_tx)
    tx = res_tx.scalar_one_or_none()
    assert tx is not None
    assert tx.seller_id == farmer.id
    assert tx.quantity_kg == 60.0
    assert tx.amount == 60.0 * 50000.0
    assert tx.payment_status == PaymentStatus.PENDING
    assert tx.escrow_status == EscrowStatus.NOT_STARTED

    app.dependency_overrides.clear()

# Test Bug 3: Pickup timeout sets escrow_status = REFUNDED
async def test_pickup_timeout_refunds_escrow(test_fixes_context):
    db, buyer, farmer, product, demand = test_fixes_context

    order = Order(
        id=uuid.uuid4(),
        product_id=product.id,
        buyer_id=buyer.id,
        quantity_kg=10.0,
        status=OrderStatus.SIAP_DIAMBIL,
        payment_status=PaymentStatus.PAID,
        escrow_status=EscrowStatus.HELD,
        marked_ready_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=4)
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    # Call system_timeout_pickup
    await system_timeout_pickup(db, order)
    await db.refresh(order)

    assert order.status == OrderStatus.DIBATALKAN
    assert order.escrow_status == EscrowStatus.REFUNDED

# Test Bug 4: PATCH /orders/{id}/confirm-success releases escrow & triggers payout
@patch("app.services.xendit_service.xendit_service.create_disbursement", new_callable=AsyncMock)
async def test_confirm_order_success_releases_escrow(mock_create_disbursement, test_fixes_context):
    mock_create_disbursement.return_value = {"id": "disb-9999", "status": "PENDING"}
    db, buyer, farmer, product, demand = test_fixes_context

    order = Order(
        id=uuid.uuid4(),
        product_id=product.id,
        buyer_id=buyer.id,
        quantity_kg=5.0,
        status=OrderStatus.SIAP_DIAMBIL,
        payment_status=PaymentStatus.PAID,
        escrow_status=EscrowStatus.HELD
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.patch(f"/orders/{order.id}/confirm-success")

    assert res.status_code == 200
    res_data = res.json()
    assert res_data["status"] == OrderStatus.SELESAI.value
    assert res_data["escrow_status"] == EscrowStatus.RELEASED.value

    await db.refresh(order)
    assert order.status == OrderStatus.SELESAI
    assert order.escrow_status == EscrowStatus.RELEASED
    assert order.disbursement_id == "disb-9999"

    app.dependency_overrides.clear()

# Test Bug 5: Expired demand request is marked KEDALUWARSA by scheduler
async def test_scheduler_expires_demand_requests(test_fixes_context):
    db, buyer, farmer, product, demand = test_fixes_context

    # Set deadline in past
    demand.deadline = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2)
    demand.status = DemandRequestStatus.TERBUKA
    db.add(demand)
    await db.commit()

    await check_expired_demand_requests()

    await db.refresh(demand)
    assert demand.status == DemandRequestStatus.KEDALUWARSA
