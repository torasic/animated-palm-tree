import pytest
import uuid
from sqlalchemy import select, delete
from httpx import AsyncClient
import httpx
import pytest_asyncio

from app.db import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.conversation import Conversation
from app.services import auth_service
from main import app

pytestmark = pytest.mark.asyncio

@pytest_asyncio.fixture
async def test_conv_context():
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
            try:
                await db.rollback()
            except Exception:
                pass
            try:
                await db.execute(delete(Conversation).where((Conversation.buyer_id == buyer.id) | (Conversation.seller_id == seller.id)))
                await db.execute(delete(Product).where(Product.id == product.id))
                await db.execute(delete(User).where(User.id == buyer.id))
                await db.execute(delete(User).where(User.id == seller.id))
                await db.commit()
            except Exception:
                await db.rollback()
            await db.close()

async def test_buyer_create_conversation_with_product_success(test_conv_context):
    db, buyer, seller, product = test_conv_context

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/conversations", json={
            "product_id": str(product.id)
        })

    assert response.status_code == 200
    res_data = response.json()
    assert "conversation_id" in res_data

async def test_seller_create_conversation_with_product_and_buyer_success(test_conv_context):
    db, buyer, seller, product = test_conv_context

    app.dependency_overrides[auth_service.get_current_user] = lambda: seller

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/conversations", json={
            "product_id": str(product.id),
            "buyer_id": str(buyer.id)
        })

    assert response.status_code == 200
    res_data = response.json()
    assert "conversation_id" in res_data

async def test_seller_create_conversation_with_product_no_buyer_fails(test_conv_context):
    db, buyer, seller, product = test_conv_context

    app.dependency_overrides[auth_service.get_current_user] = lambda: seller

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/conversations", json={
            "product_id": str(product.id)
        })

    assert response.status_code == 400
    assert "Buyer ID must be provided" in response.json()["detail"]

async def test_buyer_create_conversation_with_self_fails(test_conv_context):
    db, buyer, seller, product = test_conv_context

    app.dependency_overrides[auth_service.get_current_user] = lambda: buyer

    async with AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.post("/conversations", json={
            "buyer_id": str(buyer.id)
        })

    assert response.status_code == 400
    assert "Cannot start a conversation with yourself" in response.json()["detail"]
