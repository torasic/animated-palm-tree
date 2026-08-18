import pytest
import uuid
from datetime import datetime, timezone
from sqlalchemy import select, delete
from httpx import AsyncClient

from app.db import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.demand_request import DemandRequest, DemandRequestStatus, SupplyCommitment
from app.models.payment_transaction import DemandTransaction, PaymentStatus, EscrowStatus
from app.services import auth_service
from main import app
import httpx

import pytest_asyncio

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture
async def test_cancel_context():
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

        # Create Demand Request (TERBUKA, no commitments)
        demand = DemandRequest(
            id=uuid.uuid4(),
            buyer_id=buyer.id,
            commodity_name="Cabe Keriting",
            category="Sayuran",
            quantity_kg_needed=50.0,
            quantity_kg_committed=0.0,
            price_per_kg=30000.0,
            deadline=datetime.now(timezone.utc).replace(tzinfo=None),
            status=DemandRequestStatus.TERBUKA
        )
        db.add(demand)
        await db.commit()

        try:
            yield db, buyer, seller, demand
        finally:
            try:
                await db.rollback()
            except Exception:
                pass
            try:
                await db.execute(delete(DemandTransaction).where(DemandTransaction.demand_request_id == demand.id))
                await db.execute(delete(SupplyCommitment).where(SupplyCommitment.demand_request_id == demand.id))
                await db.execute(delete(DemandRequest).where(DemandRequest.id == demand.id))
                await db.execute(delete(User).where(User.id == buyer.id))
                await db.execute(delete(User).where(User.id == seller.id))
                await db.commit()
            except Exception:
                await db.rollback()
            await db.close()

async def test_cancel_demand_request_success(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(f"/demand-requests/{demand.id}/cancel")

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["id"] == str(demand.id)
    assert res_data["status"] == "DIBATALKAN"

    # Verify status in database
    stmt = select(DemandRequest).where(DemandRequest.id == demand.id)
    res = await db.execute(stmt)
    db_demand = res.scalar_one()
    await db.refresh(db_demand)
    assert db_demand.status == DemandRequestStatus.DIBATALKAN

    app.dependency_overrides.clear()

async def test_cancel_demand_request_unauthorized(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    # Try cancelling as the seller instead of the buyer
    app.dependency_overrides[auth_service.get_current_user] = lambda: seller

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(f"/demand-requests/{demand.id}/cancel")

    assert response.status_code == 403
    assert "Hanya pembeli pembuat permintaan" in response.json()["detail"]

    # Verify status remains TERBUKA in db
    await db.refresh(demand)
    assert demand.status == DemandRequestStatus.TERBUKA

    app.dependency_overrides.clear()

async def test_cancel_demand_request_already_committed(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    # Add a commitment
    commitment = SupplyCommitment(
        demand_request_id=demand.id,
        petani_id=seller.id,
        quantity_kg_committed=10.0
    )
    db.add(commitment)
    demand.quantity_kg_committed = 10.0
    db.add(demand)
    await db.commit()

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post(f"/demand-requests/{demand.id}/cancel")

    assert response.status_code == 400
    assert "sudah ada komitmen" in response.json()["detail"]

    # Verify status remains TERBUKA in db
    await db.refresh(demand)
    assert demand.status == DemandRequestStatus.TERBUKA

    app.dependency_overrides.clear()

async def test_farmer_update_fulfillment_siap_diantar(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    # Create a paid & held DemandTransaction
    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=demand.id,
        seller_id=seller.id,
        quantity_kg=10.0,
        price_per_kg=30000.0,
        amount=300000.0,
        payment_status=PaymentStatus.PAID,
        escrow_status=EscrowStatus.HELD,
        fulfillment_status="DIPROSES",
        xendit_external_id=f"ext_{uuid.uuid4().hex}"
    )
    db.add(dt)
    await db.commit()

    app.dependency_overrides[auth_service.get_current_user] = lambda: seller

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.patch(
            f"/demand-requests/{demand.id}/transactions/{dt.id}/fulfillment-status",
            json={"fulfillment_status": "SIAP_DIANTAR"}
        )

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["fulfillment_status"] == "SIAP_DIANTAR"
    assert res_data["marked_ready_at"] is not None

    # Verify in DB
    stmt = select(DemandTransaction).where(DemandTransaction.id == dt.id)
    res = await db.execute(stmt)
    db_tx = res.scalar_one()
    await db.refresh(db_tx)
    assert db_tx.fulfillment_status == "SIAP_DIANTAR"
    assert db_tx.marked_ready_at is not None

    app.dependency_overrides.clear()

async def test_farmer_update_fulfillment_siap_diambil(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    # Create a paid & held DemandTransaction
    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=demand.id,
        seller_id=seller.id,
        quantity_kg=10.0,
        price_per_kg=30000.0,
        amount=300000.0,
        payment_status=PaymentStatus.PAID,
        escrow_status=EscrowStatus.HELD,
        fulfillment_status="DIPROSES",
        xendit_external_id=f"ext_{uuid.uuid4().hex}"
    )
    db.add(dt)
    await db.commit()

    app.dependency_overrides[auth_service.get_current_user] = lambda: seller

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.patch(
            f"/demand-requests/{demand.id}/fulfillment-status",
            json={"fulfillment_status": "SIAP_DIAMBIL"}
        )

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["fulfillment_status"] == "SIAP_DIAMBIL"

    app.dependency_overrides.clear()

async def test_cannot_update_fulfillment_if_unpaid(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    # Create an unpaid DemandTransaction
    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=demand.id,
        seller_id=seller.id,
        quantity_kg=10.0,
        price_per_kg=30000.0,
        amount=300000.0,
        payment_status=PaymentStatus.PENDING,
        escrow_status=EscrowStatus.NOT_STARTED,
        fulfillment_status="DIPROSES",
        xendit_external_id=f"ext_{uuid.uuid4().hex}"
    )
    db.add(dt)
    await db.commit()

    app.dependency_overrides[auth_service.get_current_user] = lambda: seller

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.patch(
            f"/demand-requests/{demand.id}/transactions/{dt.id}/fulfillment-status",
            json={"fulfillment_status": "SIAP_DIANTAR"}
        )

    assert response.status_code == 400
    assert "belum dibayar oleh pembeli" in response.json()["detail"]

    app.dependency_overrides.clear()

async def test_buyer_cannot_update_fulfillment(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    # Create a paid DemandTransaction
    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=demand.id,
        seller_id=seller.id,
        quantity_kg=10.0,
        price_per_kg=30000.0,
        amount=300000.0,
        payment_status=PaymentStatus.PAID,
        escrow_status=EscrowStatus.HELD,
        fulfillment_status="DIPROSES",
        xendit_external_id=f"ext_{uuid.uuid4().hex}"
    )
    db.add(dt)
    await db.commit()

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.patch(
            f"/demand-requests/{demand.id}/transactions/{dt.id}/fulfillment-status",
            json={"fulfillment_status": "SIAP_DIANTAR"}
        )

    assert response.status_code == 403

    app.dependency_overrides.clear()

async def test_cannot_update_fulfillment_if_already_released(test_cancel_context):
    db, buyer, seller, demand = test_cancel_context

    # Create a completed / released DemandTransaction
    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=demand.id,
        seller_id=seller.id,
        quantity_kg=10.0,
        price_per_kg=30000.0,
        amount=300000.0,
        payment_status=PaymentStatus.PAID,
        escrow_status=EscrowStatus.RELEASED,
        fulfillment_status="SELESAI",
        xendit_external_id=f"ext_{uuid.uuid4().hex}"
    )
    db.add(dt)
    await db.commit()

    app.dependency_overrides[auth_service.get_current_user] = lambda: seller

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.patch(
            f"/demand-requests/{demand.id}/transactions/{dt.id}/fulfillment-status",
            json={"fulfillment_status": "SIAP_DIANTAR"}
        )

    assert response.status_code == 400
    assert "sudah selesai dan dana telah dicairkan" in response.json()["detail"]

    app.dependency_overrides.clear()


