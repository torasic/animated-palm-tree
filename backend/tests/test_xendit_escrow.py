import pytest
import uuid
from unittest.mock import patch, AsyncMock
from datetime import datetime, timezone
from sqlalchemy import select, delete

from app.db import AsyncSessionLocal
from app.config import settings
from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.order import Order, OrderStatus
from app.models.demand_request import DemandRequest, DemandRequestStatus
from app.models.payment_transaction import (
    DemandTransaction,
    PaymentTransaction,
    PaymentStatus,
    EscrowStatus
)
from app.services.escrow_service import escrow_service

import pytest_asyncio

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture
async def test_escrow_context():
    # Reset engine connections
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

        # Create Seller
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
            name="Cabe Rawit Hijau",
            category="Sayuran",
            quantity_kg=50.0,
            price_per_kg=40000.0,
            status=ProductStatus.TERSEDIA
        )
        db.add(product)

        # Create Demand Request
        demand = DemandRequest(
            id=uuid.uuid4(),
            buyer_id=buyer.id,
            commodity_name="Cabe Rawit Hijau",
            category="Sayuran",
            quantity_kg_needed=20.0,
            price_per_kg=40000.0,
            deadline=datetime.now(timezone.utc).replace(tzinfo=None),
            status=DemandRequestStatus.TERBUKA
        )
        db.add(demand)
        await db.commit()

        try:
            yield db, buyer, seller, product, demand
        finally:
            from sqlalchemy import delete
            try:
                await db.rollback()
            except Exception:
                pass
            try:
                await db.execute(delete(DemandTransaction).where(DemandTransaction.demand_request_id == demand.id))
                await db.execute(delete(PaymentTransaction))
                await db.execute(delete(Order).where(Order.product_id == product.id))
                await db.execute(delete(DemandRequest).where(DemandRequest.id == demand.id))
                await db.execute(delete(Product).where(Product.id == product.id))
                await db.execute(delete(User).where(User.id == buyer.id))
                await db.execute(delete(User).where(User.id == seller.id))
                await db.commit()
            except Exception as e:
                print(f"Error during test context cleanup: {e}")
                await db.rollback()
            await db.close()

@patch("app.services.xendit_service.xendit_service.create_disbursement", new_callable=AsyncMock)
@patch("app.services.xendit_service.xendit_service.create_invoice", new_callable=AsyncMock)
async def test_order_escrow_lifecycle(mock_create_invoice, mock_create_disbursement, test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context

    # Mock return values
    mock_create_invoice.return_value = ("https://checkout.xendit.co/v2/test-invoice", "inv-12345")
    mock_create_disbursement.return_value = {"id": "disb-1111", "status": "PENDING"}

    # Set seller bank details
    seller.bank_name = "MANDIRI"
    seller.bank_account_number = "1234567890"
    seller.bank_account_holder = "Test Seller"
    db.add(seller)
    await db.commit()

    # 1. Create order
    order = Order(
        id=uuid.uuid4(),
        product_id=product.id,
        buyer_id=buyer.id,
        quantity_kg=5.0,
        status=OrderStatus.MENUNGGU_KONFIRMASI
    )
    db.add(order)
    await db.commit()

    # 2. Checkout
    invoice_url = await escrow_service.checkout_transaction(
        db=db,
        source_type="pesanan",
        source_id=order.id,
        buyer_email=buyer.email,
        success_redirect_url="http://test.com/success",
        failure_redirect_url="http://test.com/failure"
    )

    assert invoice_url == "https://checkout.xendit.co/v2/test-invoice"
    
    # Reload order to assert pending state
    await db.refresh(order)
    assert order.payment_status == PaymentStatus.PENDING
    assert order.escrow_status == EscrowStatus.NOT_STARTED
    assert order.xendit_invoice_id == "inv-12345"
    assert order.xendit_external_id is not None

    # Check that generic PaymentTransaction log was created
    stmt_tx = select(PaymentTransaction).where(PaymentTransaction.source_id == order.id)
    res_tx = await db.execute(stmt_tx)
    payment_tx = res_tx.scalar_one()
    assert payment_tx.amount == 200000.0  # 5kg * 40000.0

    # 3. Simulate payment webhook PAID callback
    await escrow_service.handle_payment_success(db, order.xendit_external_id, "inv-12345")
    await db.refresh(order)
    assert order.payment_status == PaymentStatus.PAID
    assert order.escrow_status == EscrowStatus.HELD
    assert order.status == OrderStatus.DIPROSES

    # 4. Simulate Buyer Confirm Received -> Release escrow
    # Set status to SIAP_DIAMBIL to satisfy state machine checks
    order.status = OrderStatus.SIAP_DIAMBIL
    db.add(order)
    await db.commit()

    await escrow_service.confirm_received_and_release(db, "pesanan", order.id, buyer.id)
    await db.refresh(order)
    assert order.escrow_status == EscrowStatus.RELEASED
    assert order.status == OrderStatus.SELESAI
    assert order.confirmed_received_at is not None
    assert order.disbursement_id == "disb-1111"
    assert order.disbursement_status == "pending"
    assert order.disbursed_at is not None

@patch("app.services.xendit_service.xendit_service.create_disbursement", new_callable=AsyncMock)
@patch("app.services.xendit_service.xendit_service.create_invoice", new_callable=AsyncMock)
async def test_demand_escrow_lifecycle(mock_create_invoice, mock_create_disbursement, test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context
    mock_create_invoice.return_value = ("https://checkout.xendit.co/v2/test-invoice-demand", "inv-67890")
    mock_create_disbursement.return_value = {"id": "disb-2222", "status": "PENDING"}

    # Set seller bank details
    seller.bank_name = "BRI"
    seller.bank_account_number = "0987654321"
    seller.bank_account_holder = "Test Seller"
    db.add(seller)
    await db.commit()

    # 1. Create a matched DemandTransaction (transaksi_permintaan)
    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=demand.id,
        seller_id=seller.id,
        quantity_kg=10.0,
        price_per_kg=40000.0,
        amount=400000.0,
        payment_status=PaymentStatus.PENDING,
        escrow_status=EscrowStatus.NOT_STARTED,
        xendit_external_id=f"permintaan_{demand.id.hex}_test"
    )
    db.add(dt)
    await db.commit()

    # 2. Checkout
    invoice_url = await escrow_service.checkout_transaction(
        db=db,
        source_type="permintaan",
        source_id=dt.id,
        buyer_email=buyer.email,
        success_redirect_url="http://test.com/success",
        failure_redirect_url="http://test.com/failure"
    )

    assert invoice_url == "https://checkout.xendit.co/v2/test-invoice-demand"

    # Reload transaction to assert pending state
    await db.refresh(dt)
    assert dt.payment_status == PaymentStatus.PENDING
    assert dt.escrow_status == EscrowStatus.NOT_STARTED
    assert dt.xendit_invoice_id == "inv-67890"

    # 3. Simulate payment webhook
    await escrow_service.handle_payment_success(db, dt.xendit_external_id, "inv-67890")
    await db.refresh(dt)
    assert dt.payment_status == PaymentStatus.PAID
    assert dt.escrow_status == EscrowStatus.HELD

    # 4. Confirm Received -> Release escrow
    await escrow_service.confirm_received_and_release(db, "permintaan", dt.id, buyer.id)
    await db.refresh(dt)
    assert dt.escrow_status == EscrowStatus.RELEASED
    assert dt.released_at is not None
    assert dt.disbursement_id == "disb-2222"
    assert dt.disbursement_status == "pending"
    assert dt.disbursed_at is not None

from httpx import AsyncClient
from main import app

async def test_xendit_webhook_endpoint_casing(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context

    unique_suffix = uuid.uuid4().hex[:6]
    webhook_external_id = f"pesanan_test_webhook_external_id_{unique_suffix}"
    webhook_invoice_id = f"inv-webhook-test-{unique_suffix}"

    # Create an order in pending payment state
    order = Order(
        id=uuid.uuid4(),
        product_id=product.id,
        buyer_id=buyer.id,
        quantity_kg=5.0,
        status=OrderStatus.MENUNGGU_KONFIRMASI,
        xendit_external_id=webhook_external_id,
        xendit_invoice_id=webhook_invoice_id,
        payment_status=PaymentStatus.PENDING
    )
    db.add(order)
    
    # We also need a PaymentTransaction log
    payment_tx = PaymentTransaction(
        source_type="pesanan",
        source_id=order.id,
        xendit_external_id=webhook_external_id,
        amount=200000.0
    )
    db.add(payment_tx)
    await db.commit()

    # 1. Test standard mixed-case header "X-Callback-Token"
    payload = {
        "external_id": webhook_external_id,
        "id": webhook_invoice_id,
        "status": "PAID"
    }

    import httpx
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/webhooks/xendit",
            json=payload,
            headers={"X-Callback-Token": settings.XENDIT_WEBHOOK_TOKEN}
        )
    
    assert response.status_code == 200
    assert response.json() == {"status": "success"}

    # Refresh order and assert paid
    await db.refresh(order)
    assert order.payment_status == PaymentStatus.PAID
    assert order.escrow_status == EscrowStatus.HELD

    # 2. Test invalid webhook token to ensure it still properly rejects unauthorized requests
    import httpx
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            "/webhooks/xendit",
            json=payload,
            headers={"X-Callback-Token": "invalid-token"}
        )
    assert response.status_code == 401


async def test_get_committed_demand_requests_matching(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context

    # 1. Create a matched DemandTransaction
    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=demand.id,
        seller_id=seller.id,
        quantity_kg=10.0,
        price_per_kg=40000.0,
        amount=400000.0,
        payment_status=PaymentStatus.PENDING,
        escrow_status=EscrowStatus.NOT_STARTED,
        xendit_external_id=f"permintaan_{demand.id.hex}_matching_test"
    )
    db.add(dt)
    
    # Update demand request status to matched
    demand.quantity_kg_committed = 10.0
    demand.status = DemandRequestStatus.TERPENUHI
    db.add(demand)
    await db.commit()

    # Import app and auth_service to override get_current_user dependency
    from app.services import auth_service
    from main import app
    import httpx

    # Test as Farmer (Petani/Seller) - should return the matched request
    app.dependency_overrides[auth_service.get_current_user] = lambda: seller
    
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/demand-requests/committed")
    
    assert response.status_code == 200
    res_data = response.json()
    assert len(res_data) == 1
    assert res_data[0]["id"] == str(demand.id)
    assert res_data[0]["match_transaction"] is not None
    assert res_data[0]["match_transaction"]["seller_id"] == str(seller.id)
    assert res_data[0]["match_transaction"]["payment_status"] == "pending"

    # Test as Buyer (Pembeli) - should also return the matched request
    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/demand-requests/committed")
    
    assert response.status_code == 200
    res_data = response.json()
    assert len(res_data) == 1
    assert res_data[0]["id"] == str(demand.id)
    assert res_data[0]["match_transaction"] is not None
    assert res_data[0]["match_transaction"]["seller_id"] == str(seller.id)

    # Clean up overrides
    app.dependency_overrides.clear()


async def test_get_matching_candidates(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context

    # Set up embeddings to be semantically identical (distance = 0.0) and unique
    # to avoid collisions with constant vectors like [0.1]*768 in dev database
    product.embedding = [0.9] + [0.0] * 767
    demand.embedding = [0.9] + [0.0] * 767
    db.add(product)
    db.add(demand)
    await db.commit()

    from app.services import auth_service
    from main import app
    import httpx

    # Set buyer as current user
    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get(f"/demand-requests/{demand.id}/candidates")

    assert response.status_code == 200
    res_data = response.json()
    assert len(res_data) > 0
    candidate = next((c for c in res_data if c["product_id"] == str(product.id)), None)
    assert candidate is not None
    assert candidate["seller_name"] == seller.full_name
    assert candidate["price_per_kg"] == product.price_per_kg
    assert candidate["quantity_kg"] == product.quantity_kg
    assert candidate["distance_score"] < 0.1

    # Cleanup overrides
    app.dependency_overrides.clear()


async def test_match_with_selected_product(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context

    # Set up embeddings
    product.embedding = [0.1] * 768
    demand.embedding = [0.1] * 768
    db.add(product)
    db.add(demand)
    await db.commit()

    from app.services import auth_service
    from main import app
    import httpx

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            f"/demand-requests/{demand.id}/match",
            json={"product_id": str(product.id)}
        )

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["matched"] is True
    assert res_data["seller_name"] == product.name

    # Check that transaction was created
    stmt = select(DemandTransaction).where(DemandTransaction.demand_request_id == demand.id)
    res_tx = await db.execute(stmt)
    dt = res_tx.scalar_one_or_none()
    assert dt is not None
    assert dt.seller_id == seller.id
    assert dt.quantity_kg == min(product.quantity_kg, demand.quantity_kg_needed)

    # Check demand request status and progress
    await db.refresh(demand)
    assert demand.status == DemandRequestStatus.TERPENUHI
    assert demand.quantity_kg_committed == dt.quantity_kg

    # Clean up transaction to avoid FK issues during fixture teardown
    await db.delete(dt)
    await db.commit()

    app.dependency_overrides.clear()


async def test_match_rejects_invalid_product_id(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context

    product.embedding = [0.1] * 768
    demand.embedding = [0.1] * 768
    db.add(product)
    db.add(demand)
    await db.commit()

    from app.services import auth_service
    from main import app
    import httpx

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    # Case 1: Random product ID that does not exist
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            f"/demand-requests/{demand.id}/match",
            json={"product_id": str(uuid.uuid4())}
        )
    assert response.status_code == 409
    assert "tidak ditemukan" in response.json()["detail"].lower()

    # Case 2: Product more expensive (should match successfully now)
    expensive_product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        name="Cabe Rawit Mahal",
        category="Sayuran",
        quantity_kg=50.0,
        price_per_kg=80000.0,  # demand is 40000.0
        status=ProductStatus.TERSEDIA,
        embedding=[0.1] * 768
    )
    db.add(expensive_product)
    await db.commit()

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            f"/demand-requests/{demand.id}/match",
            json={"product_id": str(expensive_product.id)}
        )
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "success"
    assert res_data["matched"] is True

    # Delete the created demand transaction and restore demand request to avoid FK/state issues
    tx_id = uuid.UUID(res_data["transaction_id"])
    stmt_del = delete(DemandTransaction).where(DemandTransaction.id == tx_id)
    await db.execute(stmt_del)
    await db.refresh(demand)
    demand.status = DemandRequestStatus.TERBUKA
    demand.quantity_kg_committed = 0.0
    db.add(demand)
    await db.commit()

    # Case 3: Product too far semantically (distance > 0.5)
    unrelated_product = Product(
        id=uuid.uuid4(),
        seller_id=seller.id,
        name="Apel Malang",
        category="Buah",
        quantity_kg=50.0,
        price_per_kg=30000.0,
        status=ProductStatus.TERSEDIA,
        embedding=[-0.1] * 768  # Distance will be 2.0
    )
    db.add(unrelated_product)
    await db.commit()

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            f"/demand-requests/{demand.id}/match",
            json={"product_id": str(unrelated_product.id)}
        )
    assert response.status_code == 409
    assert "tidak valid" in response.json()["detail"].lower()

    # Teardown custom products
    await db.delete(expensive_product)
    await db.delete(unrelated_product)
    await db.commit()

    app.dependency_overrides.clear()


async def test_match_race_condition(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context

    # Update both demands to require 50.0 kg (matching the product's total stock of 50.0 kg)
    product.embedding = [0.1] * 768
    demand.embedding = [0.1] * 768
    demand.quantity_kg_needed = 50.0
    db.add(product)
    db.add(demand)

    # Create a second demand request for the same buyer
    demand_b = DemandRequest(
        id=uuid.uuid4(),
        buyer_id=buyer.id,
        commodity_name="Cabe Rawit Hijau",
        category="Sayuran",
        quantity_kg_needed=50.0,
        price_per_kg=40000.0,
        deadline=datetime.now(timezone.utc).replace(tzinfo=None),
        status=DemandRequestStatus.TERBUKA,
        embedding=[0.1] * 768
    )
    db.add(demand_b)
    await db.commit()

    from app.services import auth_service
    from main import app
    import httpx
    import asyncio

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    # We send both match requests concurrently
    async def make_request(demand_id):
        async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
            return await ac.post(
                f"/demand-requests/{demand_id}/match",
                json={"product_id": str(product.id)}
            )

    results = []
    try:
        # Run concurrently
        results = await asyncio.gather(
            make_request(demand.id),
            make_request(demand_b.id),
            return_exceptions=True
        )

        # One request must succeed (200), and the other must fail with 409 Conflict (or 400 Bad Request in single-transaction test sessions)
        status_codes = [r.status_code for r in results if not isinstance(r, Exception)]
        assert 200 in status_codes
        assert (409 in status_codes) or (400 in status_codes)
    finally:
        # Clean up transactions created during the test
        for r in results:
            if not isinstance(r, Exception) and r.status_code == 200:
                res_data = r.json()
                tx_id = uuid.UUID(res_data["transaction_id"])
                stmt_del = select(DemandTransaction).where(DemandTransaction.id == tx_id)
                res_tx = await db.execute(stmt_del)
                tx_obj = res_tx.scalar_one_or_none()
                if tx_obj:
                    await db.delete(tx_obj)

        await db.delete(demand_b)
        await db.commit()
        app.dependency_overrides.clear()

async def test_demand_transaction_timeout(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context
    from app.services import auth_service
    from main import app
    import httpx
    from datetime import timedelta
    from app.services.scheduler import check_demand_match_timeouts
    from app.models.payment_transaction import PaymentStatus
    from app.models.product import ProductStatus
    
    product.embedding = [0.9] + [0.0] * 767
    demand.embedding = [0.9] + [0.0] * 767
    db.add(product)
    db.add(demand)
    await db.commit()
    
    # Save initial stock to compare later
    initial_stock = product.quantity_kg
    
    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer
    
    # 1. Match the demand request with the product
    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(
            f"/demand-requests/{demand.id}/match",
            json={"product_id": str(product.id), "quantity_kg": 20.0}
        )
    assert response.status_code == 200
    res_data = response.json()
    tx_id = uuid.UUID(res_data["transaction_id"])
    
    # Re-verify that stock was deducted
    await db.refresh(product)
    await db.refresh(demand)
    assert product.quantity_kg == initial_stock - 20.0
    assert demand.quantity_kg_committed == 20.0
    
    # 2. Modify the transaction to look like it timed out
    stmt_tx = select(DemandTransaction).where(DemandTransaction.id == tx_id)
    res_tx = await db.execute(stmt_tx)
    tx = res_tx.scalar_one()
    tx.created_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=25)
    db.add(tx)
    await db.commit()
    
    # 3. Run scheduler timeout check
    await check_demand_match_timeouts()
    
    # 4. Verify everything is reverted and expired
    await db.refresh(tx)
    await db.refresh(product)
    await db.refresh(demand)
    
    assert tx.payment_status == PaymentStatus.EXPIRED
    assert product.quantity_kg == initial_stock
    assert product.status == ProductStatus.TERSEDIA
    assert demand.quantity_kg_committed == 0.0
    assert demand.status == DemandRequestStatus.TERBUKA
    
    # Clean up the transaction manually since it's not handled by fixture cleanup
    await db.delete(tx)
    await db.commit()
    app.dependency_overrides.clear()

async def test_webhook_payment_success_on_cancelled_order(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context
    from app.services import auth_service
    from app.models.order import Order, OrderStatus
    from app.models.payment_transaction import PaymentTransaction, EscrowStatus, PaymentStatus
    from main import app
    import httpx
    
    # 1. Create a cancelled order
    order = Order(
        id=uuid.uuid4(),
        product_id=product.id,
        buyer_id=buyer.id,
        quantity_kg=5.0,
        status=OrderStatus.DIBATALKAN,
        payment_status=PaymentStatus.PENDING,
        escrow_status=EscrowStatus.NOT_STARTED,
        xendit_external_id=f"pesanan_{uuid.uuid4().hex[:6]}_race_test"
    )
    db.add(order)
    
    # Create the mapping payment transaction log
    pt = PaymentTransaction(
        id=uuid.uuid4(),
        source_type="pesanan",
        source_id=order.id,
        xendit_external_id=order.xendit_external_id,
        amount=product.price_per_kg * 5.0
    )
    db.add(pt)
    await db.commit()
    
    # Mock Xendit webhook callback token verification to bypass auth check
    with patch("app.services.xendit_service.xendit_service.verify_webhook_token", return_value=True):
        async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/webhooks/xendit",
                headers={"x-callback-token": "dummy_token"},
                json={
                    "external_id": order.xendit_external_id,
                    "id": "invoice_dummy_id_123",
                    "status": "PAID"
                }
            )
            
    assert response.status_code == 200
    await db.refresh(order)
    
    # The order status remains DIBATALKAN, but the payment is PAID and escrow status is REFUNDED
    assert order.status == OrderStatus.DIBATALKAN
    assert order.payment_status == PaymentStatus.PAID
    assert order.escrow_status == EscrowStatus.REFUNDED
    
    # Teardown order & transaction
    await db.delete(pt)
    await db.delete(order)
    await db.commit()

async def test_webhook_payment_expired_cancels_order(test_escrow_context):
    db, buyer, seller, product, demand = test_escrow_context
    from app.services import auth_service
    from app.models.order import Order, OrderStatus, CancellationReason
    from app.models.payment_transaction import PaymentTransaction, EscrowStatus, PaymentStatus
    from main import app
    import httpx
    
    initial_stock = product.quantity_kg
    
    # 1. Create a waiting confirmation order and deduct stock
    product.quantity_kg -= 5.0
    db.add(product)
    
    order = Order(
        id=uuid.uuid4(),
        product_id=product.id,
        buyer_id=buyer.id,
        quantity_kg=5.0,
        status=OrderStatus.MENUNGGU_KONFIRMASI,
        payment_status=PaymentStatus.PENDING,
        escrow_status=EscrowStatus.NOT_STARTED,
        xendit_external_id=f"pesanan_{uuid.uuid4().hex[:6]}_expired_test"
    )
    db.add(order)
    
    # Create the mapping payment transaction log
    pt = PaymentTransaction(
        id=uuid.uuid4(),
        source_type="pesanan",
        source_id=order.id,
        xendit_external_id=order.xendit_external_id,
        amount=product.price_per_kg * 5.0
    )
    db.add(pt)
    await db.commit()
    
    # Mock Xendit webhook callback token verification to bypass auth check
    with patch("app.services.xendit_service.xendit_service.verify_webhook_token", return_value=True):
        async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/webhooks/xendit",
                headers={"x-callback-token": "dummy_token"},
                json={
                    "external_id": order.xendit_external_id,
                    "id": "invoice_dummy_id_123",
                    "status": "EXPIRED"
                }
            )
            
    assert response.status_code == 200
    await db.refresh(order)
    await db.refresh(product)
    
    # The order status should now be DIBATALKAN due to TIMEOUT_KONFIRMASI, payment is EXPIRED, and stock restored
    assert order.status == OrderStatus.DIBATALKAN
    assert order.cancellation_reason == CancellationReason.TIMEOUT_KONFIRMASI
    assert order.payment_status == PaymentStatus.EXPIRED
    assert product.quantity_kg == initial_stock
    
    # Teardown
    await db.delete(pt)
    await db.delete(order)
    await db.commit()





