import os
import sys
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from geoalchemy2 import WKTElement

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.order import Order, OrderStatus, CancellationReason, ComplaintReason
from app.models.demand_request import DemandRequest, DemandRequestStatus, SupplyCommitment
from app.models.payment_transaction import PaymentTransaction, DemandTransaction, PaymentStatus, EscrowStatus
from app.models.rating import Rating, RoleContext, TransactionType
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.token import RefreshToken
from app.services.embedding_service import embedding_service
from app.services.price_matching_service import get_latest_reference_prices, find_reference_price, get_nearest_region

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL is not set.")
    sys.exit(1)

engine = create_async_engine(DATABASE_URL, connect_args={"statement_cache_size": 0})
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

# Locations: Coordinates around Yogyakarta
YOGYA_LAT = -7.7956
YOGYA_LNG = 110.3695
SLEMAN_LAT = -7.6974
SLEMAN_LNG = 110.3957
BANTUL_LAT = -7.8897
BANTUL_LNG = 110.3289
KP_LAT = -7.8322
KP_LNG = 110.1581

def make_location(lat, lng):
    return WKTElement(f"POINT({lng} {lat})", srid=4326)

async def get_embedding(text_query: str) -> list:
    try:
        emb = await embedding_service.generate_embedding(text_query)
        return emb
    except Exception as e:
        print(f"Warning: Failed to generate embedding for '{text_query}': {e}. Using dummy embedding.")
        return [0.0] * 768

async def main():
    print("--- Starting Realistic Database Seeder ---")
    
    async with AsyncSessionLocal() as session:
        # 1. Clean existing database tables (in correct foreign key order)
        print("Cleaning up old database tables...")
        await session.execute(delete(Message))
        await session.execute(delete(Conversation))
        await session.execute(delete(Rating))
        await session.execute(delete(PaymentTransaction))
        await session.execute(delete(DemandTransaction))
        await session.execute(delete(SupplyCommitment))
        await session.execute(delete(Order))
        await session.execute(delete(Product))
        await session.execute(delete(DemandRequest))
        await session.execute(delete(RefreshToken))
        await session.execute(delete(User))
        await session.commit()
        print("Database cleaned successfully.")

        # 2. Seed Users (Farmers & Buyers)
        print("Seeding Users...")
        
        # Farmers (Petani)
        farmer_sugeng = User(
            id=uuid.uuid4(),
            email="sugeng.sleman@fiktifmail.com",
            google_sub="sub_farmer_sugeng",
            full_name="Pak Sugeng (Sleman)",
            role=UserRole.PETANI,
            phone_whatsapp="081223456701",
            bio="Petani cabai rawit merah dan sayuran segar asal Sleman, Yogyakarta.",
            location=make_location(SLEMAN_LAT, SLEMAN_LNG),
            bank_name="Bank Negara Indonesia (BNI)",
            bank_account_number="1234567890",
            bank_account_holder="Sugeng",
            seller_rating_avg=5.0, # Will be rated
            seller_rating_count=1,
            buyer_rating_avg=0.0,
            buyer_rating_count=0
        )
        
        farmer_joko = User(
            id=uuid.uuid4(),
            email="joko.bantul@fiktifmail.com",
            google_sub="sub_farmer_joko",
            full_name="Pak Joko (Bantul)",
            role=UserRole.PETANI,
            phone_whatsapp="081223456702",
            bio="Spesialis tani padi pandan wangi dan bawang merah organik di Bantul.",
            location=make_location(BANTUL_LAT, BANTUL_LNG),
            bank_name="Bank Mandiri",
            bank_account_number="9876543210",
            bank_account_holder="Joko",
            seller_rating_avg=0.0,
            seller_rating_count=0,
            buyer_rating_avg=0.0,
            buyer_rating_count=0
        )
        
        farmer_totok = User(
            id=uuid.uuid4(),
            email="totok.kp@fiktifmail.com",
            google_sub="sub_farmer_totok",
            full_name="Ibu Totok (Kulon Progo)",
            role=UserRole.PETANI,
            phone_whatsapp="081223456703",
            bio="Pemilik peternakan ayam ras petelur dan ayam pedaging di Kulon Progo.",
            location=make_location(KP_LAT, KP_LNG),
            bank_name="Bank Rakyat Indonesia (BRI)",
            bank_account_number="4567891230",
            bank_account_holder="Siti Totok",
            seller_rating_avg=0.0,
            seller_rating_count=0,
            buyer_rating_avg=0.0,
            buyer_rating_count=0
        )
        
        # Buyers (Pembeli)
        buyer_sambal = User(
            id=uuid.uuid4(),
            email="sambalgledek.resto@fiktifmail.com",
            google_sub="sub_buyer_sambal",
            full_name="Resto Sambal Gledek (Yogyakarta)",
            role=UserRole.PEMBELI,
            phone_whatsapp="085712345601",
            bio="Resto spesialis kuliner pedas dengan 3 cabang di Yogyakarta.",
            location=make_location(YOGYA_LAT, YOGYA_LNG),
            seller_rating_avg=0.0,
            seller_rating_count=0,
            buyer_rating_avg=5.0, # Will be rated
            buyer_rating_count=1
        )
        
        buyer_beringharjo = User(
            id=uuid.uuid4(),
            email="beringharjo.kop@fiktifmail.com",
            google_sub="sub_buyer_beringharjo",
            full_name="Koperasi Beringharjo (Beringharjo)",
            role=UserRole.PEMBELI,
            phone_whatsapp="085712345602",
            bio="Koperasi pedagang pasar Beringharjo, melayani grosir sembako.",
            location=make_location(YOGYA_LAT, YOGYA_LNG),
            seller_rating_avg=0.0,
            seller_rating_count=0,
            buyer_rating_avg=0.0,
            buyer_rating_count=0
        )
        
        buyer_sri = User(
            id=uuid.uuid4(),
            email="sri.catering@fiktifmail.com",
            google_sub="sub_buyer_sri",
            full_name="Catering Ibu Sri (Sleman)",
            role=UserRole.PEMBELI,
            phone_whatsapp="085712345603",
            bio="Usaha katering pernikahan dan event kantor di wilayah Sleman.",
            location=make_location(YOGYA_LAT + 0.01, YOGYA_LNG - 0.01),
            seller_rating_avg=0.0,
            seller_rating_count=0,
            buyer_rating_avg=0.0,
            buyer_rating_count=0
        )
        
        session.add_all([farmer_sugeng, farmer_joko, farmer_totok, buyer_sambal, buyer_beringharjo, buyer_sri])
        await session.flush()
        print("Users seeded successfully.")

        # 3. Seed Products
        print("Seeding Products...")
        
        # Product embeddings
        emb_cabai = await get_embedding("Cabai Rawit Merah Sayuran Segar Sleman")
        emb_bawang = await get_embedding("Bawang Merah Sleman Jogja Sayur")
        emb_beras = await get_embedding("Beras Pandan Wangi Padi Pokok")
        emb_telur = await get_embedding("Telur Ayam Ras Segar POKOK Kulon Progo")
        emb_daging = await get_embedding("Daging Ayam Broiler Segar Kulon Progo")
        
        p_cabai = Product(
            id=uuid.uuid4(),
            seller_id=farmer_sugeng.id,
            name="Cabai Rawit Merah Sleman",
            category="SAYUR",
            quantity_kg=300.0,
            price_per_kg=54000.0, # Ref is ~60,000 (10% lower)
            reference_price_per_kg=60000.0,
            location=make_location(SLEMAN_LAT, SLEMAN_LNG),
            status=ProductStatus.TERSEDIA,
            photo_url="https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?q=80&w=600&auto=format&fit=crop",
            embedding=emb_cabai
        )
        
        p_bawang = Product(
            id=uuid.uuid4(),
            seller_id=farmer_joko.id,
            name="Bawang Merah Bantul",
            category="SAYUR",
            quantity_kg=150.0,
            price_per_kg=30800.0, # Ref is 28,000 (10% higher)
            reference_price_per_kg=28000.0,
            location=make_location(BANTUL_LAT, BANTUL_LNG),
            status=ProductStatus.TERSEDIA,
            photo_url="https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?q=80&w=600&auto=format&fit=crop",
            embedding=emb_bawang
        )
        
        p_beras = Product(
            id=uuid.uuid4(),
            seller_id=farmer_joko.id,
            name="Beras Pandan Wangi Premium",
            category="POKOK",
            quantity_kg=500.0,
            price_per_kg=15200.0, # Ref is 16,000 (5% lower)
            reference_price_per_kg=16000.0,
            location=make_location(BANTUL_LAT, BANTUL_LNG),
            status=ProductStatus.TERSEDIA,
            photo_url="https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=600&auto=format&fit=crop",
            embedding=emb_beras
        )
        
        p_telur = Product(
            id=uuid.uuid4(),
            seller_id=farmer_totok.id,
            name="Telur Ayam Ras Segar KP",
            category="POKOK",
            quantity_kg=200.0,
            price_per_kg=26100.0, # Ref is 29,000 (10% lower)
            reference_price_per_kg=29000.0,
            location=make_location(KP_LAT, KP_LNG),
            status=ProductStatus.TERSEDIA,
            photo_url="https://images.unsplash.com/photo-1506976785307-8732e854ad03?q=80&w=600&auto=format&fit=crop",
            embedding=emb_telur
        )
        
        p_daging = Product(
            id=uuid.uuid4(),
            seller_id=farmer_totok.id,
            name="Daging Ayam Broiler Segar",
            category="LAINNYA",
            quantity_kg=50.0,
            price_per_kg=34200.0, # Ref is 36,000 (5% lower)
            reference_price_per_kg=36000.0,
            location=make_location(KP_LAT, KP_LNG),
            status=ProductStatus.TERSEDIA,
            photo_url="https://images.unsplash.com/photo-1604503468506-a8da13d82791?q=80&w=600&auto=format&fit=crop",
            embedding=emb_daging
        )
        
        session.add_all([p_cabai, p_bawang, p_beras, p_telur, p_daging])
        await session.flush()
        print("Products seeded successfully.")

        # 4. Seed Orders (Product Purchases)
        print("Seeding Orders (Standard Purchase)...")
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        
        # Order 1: SELESAI (Completed, paid, released, rated)
        order1 = Order(
            id=uuid.uuid4(),
            product_id=p_cabai.id,
            buyer_id=buyer_sambal.id,
            quantity_kg=20.0,
            status=OrderStatus.SELESAI,
            payment_status=PaymentStatus.PAID,
            escrow_status=EscrowStatus.RELEASED,
            xendit_invoice_id="inv-order-1",
            xendit_invoice_url="https://checkout-staging.xendit.co/v2/inv-order-1",
            xendit_external_id="ext-order-1",
            created_at=now - timedelta(days=5),
            status_updated_at=now - timedelta(days=4),
            paid_at=now - timedelta(days=5) + timedelta(minutes=10),
            marked_ready_at=now - timedelta(days=5) + timedelta(hours=1),
            received_at=now - timedelta(days=4),
            completed_at=now - timedelta(days=4),
            buyer_confirmed_at=now - timedelta(days=4),
            confirmed_received_at=now - timedelta(days=4),
            released_at=now - timedelta(days=4),
            disbursement_id="disb-order-1",
            disbursement_status="SUCCESS",
            disbursed_at=now - timedelta(days=4) + timedelta(hours=1)
        )
        # Deduct stock for Order 1 (completed)
        p_cabai.quantity_kg -= 20.0
        
        # Order 2: MENUNGGU_KONFIRMASI (New unpaid order waiting for seller confirmation/payment)
        order2 = Order(
            id=uuid.uuid4(),
            product_id=p_beras.id,
            buyer_id=buyer_beringharjo.id,
            quantity_kg=100.0,
            status=OrderStatus.MENUNGGU_KONFIRMASI,
            payment_status=PaymentStatus.PENDING,
            escrow_status=EscrowStatus.NOT_STARTED,
            xendit_invoice_id="inv-order-2",
            xendit_invoice_url="https://checkout-staging.xendit.co/v2/inv-order-2",
            xendit_external_id="ext-order-2",
            created_at=now - timedelta(hours=2),
            status_updated_at=now - timedelta(hours=2)
        )
        # Deduct stock for Order 2
        p_beras.quantity_kg -= 100.0

        # Order 3: DIPROSES (Paid, held in escrow, currently being processed by seller)
        order3 = Order(
            id=uuid.uuid4(),
            product_id=p_telur.id,
            buyer_id=buyer_sri.id,
            quantity_kg=50.0,
            status=OrderStatus.DIPROSES,
            payment_status=PaymentStatus.PAID,
            escrow_status=EscrowStatus.HELD,
            xendit_invoice_id="inv-order-3",
            xendit_invoice_url="https://checkout-staging.xendit.co/v2/inv-order-3",
            xendit_external_id="ext-order-3",
            created_at=now - timedelta(days=1),
            paid_at=now - timedelta(days=1) + timedelta(minutes=15),
            status_updated_at=now - timedelta(days=1) + timedelta(minutes=15)
        )
        # Deduct stock for Order 3
        p_telur.quantity_kg -= 50.0

        # Order 4: KOMPLAIN_DIPROSES (Received but disputed/complained by buyer)
        order4 = Order(
            id=uuid.uuid4(),
            product_id=p_bawang.id,
            buyer_id=buyer_sambal.id,
            quantity_kg=30.0,
            status=OrderStatus.KOMPLAIN_DIPROSES,
            payment_status=PaymentStatus.PAID,
            escrow_status=EscrowStatus.DISPUTED,
            complaint_reason=ComplaintReason.TIDAK_SESUAI_DESKRIPSI,
            complaint_description="Bawang merah banyak yang busuk dan basah akibat pengemasan lembab.",
            xendit_invoice_id="inv-order-4",
            xendit_invoice_url="https://checkout-staging.xendit.co/v2/inv-order-4",
            xendit_external_id="ext-order-4",
            created_at=now - timedelta(days=3),
            paid_at=now - timedelta(days=3) + timedelta(minutes=10),
            marked_ready_at=now - timedelta(days=3) + timedelta(hours=1),
            received_at=now - timedelta(days=2),
            complained_at=now - timedelta(days=2) + timedelta(minutes=30),
            status_updated_at=now - timedelta(days=2) + timedelta(minutes=30)
        )
        # Deduct stock for Order 4
        p_bawang.quantity_kg -= 30.0

        # Order 5: DIBATALKAN (Timeout confirmation - unpaid, cancelled)
        order5 = Order(
            id=uuid.uuid4(),
            product_id=p_daging.id,
            buyer_id=buyer_sri.id,
            quantity_kg=10.0,
            status=OrderStatus.DIBATALKAN,
            cancellation_reason=CancellationReason.TIMEOUT_KONFIRMASI,
            payment_status=PaymentStatus.EXPIRED,
            escrow_status=EscrowStatus.NOT_STARTED,
            created_at=now - timedelta(days=2),
            status_updated_at=now - timedelta(days=1)
        )

        # Order 6: DIBATALKAN (Timeout pickup - paid, cancelled, escrow still held)
        order6 = Order(
            id=uuid.uuid4(),
            product_id=p_beras.id,
            buyer_id=buyer_beringharjo.id,
            quantity_kg=200.0,
            status=OrderStatus.DIBATALKAN,
            cancellation_reason=CancellationReason.TIMEOUT_PENGAMBILAN,
            payment_status=PaymentStatus.PAID,
            escrow_status=EscrowStatus.HELD,
            xendit_invoice_id="inv-order-6",
            xendit_invoice_url="https://checkout-staging.xendit.co/v2/inv-order-6",
            xendit_external_id="ext-order-6",
            created_at=now - timedelta(days=5),
            paid_at=now - timedelta(days=5) + timedelta(minutes=12),
            marked_ready_at=now - timedelta(days=5) + timedelta(hours=1),
            status_updated_at=now - timedelta(days=2)
        )

        session.add_all([order1, order2, order3, order4, order5, order6])
        await session.flush()
        print("Orders seeded successfully.")

        # 5. Seed Payment Transactions
        print("Seeding Payment Transactions...")
        
        # Order 1 Payment (20kg * 54000 = 1080000)
        pt1 = PaymentTransaction(
            id=uuid.uuid4(),
            source_type="pesanan",
            source_id=order1.id,
            xendit_external_id=order1.xendit_external_id,
            amount=1080000.0,
            created_at=order1.paid_at
        )
        
        # Order 3 Payment (50kg * 26100 = 1305000)
        pt3 = PaymentTransaction(
            id=uuid.uuid4(),
            source_type="pesanan",
            source_id=order3.id,
            xendit_external_id=order3.xendit_external_id,
            amount=1305000.0,
            created_at=order3.paid_at
        )
        
        # Order 4 Payment (30kg * 30800 = 924000)
        pt4 = PaymentTransaction(
            id=uuid.uuid4(),
            source_type="pesanan",
            source_id=order4.id,
            xendit_external_id=order4.xendit_external_id,
            amount=924000.0,
            created_at=order4.paid_at
        )
        
        # Order 6 Payment (200kg * 15200 = 3040000)
        pt6 = PaymentTransaction(
            id=uuid.uuid4(),
            source_type="pesanan",
            source_id=order6.id,
            xendit_external_id=order6.xendit_external_id,
            amount=3040000.0,
            created_at=order6.paid_at
        )

        session.add_all([pt1, pt3, pt4, pt6])
        await session.flush()
        print("Payment transactions seeded.")

        # 6. Seed Demand Requests & Commitments
        print("Seeding Demand Requests & commitments...")
        
        emb_dem_bawang = await get_embedding("Kebutuhan Bawang Merah Yogyakarta")
        emb_dem_cabai = await get_embedding("Kebutuhan Cabai Rawit Merah Restoran")
        
        # Demand Request 1: TERBUKA
        dr_bawang = DemandRequest(
            id=uuid.uuid4(),
            buyer_id=buyer_beringharjo.id,
            commodity_name="Bawang Merah",
            category="SAYUR",
            quantity_kg_needed=500.0,
            quantity_kg_committed=250.0,
            price_per_kg=26000.0,
            deadline=now + timedelta(days=10),
            status=DemandRequestStatus.TERBUKA,
            location=make_location(YOGYA_LAT, YOGYA_LNG),
            embedding=emb_dem_bawang,
            created_at=now - timedelta(days=2)
        )
        session.add(dr_bawang)
        await session.flush()
        
        sc1 = SupplyCommitment(
            id=uuid.uuid4(),
            demand_request_id=dr_bawang.id,
            petani_id=farmer_sugeng.id,
            quantity_kg_committed=100.0,
            committed_at=now - timedelta(days=2) + timedelta(hours=4)
        )
        
        sc2 = SupplyCommitment(
            id=uuid.uuid4(),
            demand_request_id=dr_bawang.id,
            petani_id=farmer_joko.id,
            quantity_kg_committed=150.0,
            committed_at=now - timedelta(days=1)
        )
        session.add_all([sc1, sc2])

        # Demand Request 2: TERPENUHI
        dr_cabai = DemandRequest(
            id=uuid.uuid4(),
            buyer_id=buyer_sambal.id,
            commodity_name="Cabai Rawit Merah",
            category="SAYUR",
            quantity_kg_needed=150.0,
            quantity_kg_committed=150.0,
            price_per_kg=57000.0,
            deadline=now + timedelta(days=3),
            status=DemandRequestStatus.TERPENUHI,
            location=make_location(YOGYA_LAT, YOGYA_LNG),
            embedding=emb_dem_cabai,
            created_at=now - timedelta(days=4)
        )
        session.add(dr_cabai)
        await session.flush()
        
        # Match Transaction for Demand Request 2
        dt_match = DemandTransaction(
            id=uuid.uuid4(),
            demand_request_id=dr_cabai.id,
            seller_id=farmer_sugeng.id,
            product_id=p_cabai.id,
            quantity_kg=150.0,
            price_per_kg=57000.0,
            amount=8550000.0,
            payment_status=PaymentStatus.PAID,
            escrow_status=EscrowStatus.HELD,
            xendit_invoice_id="inv-demand-match-1",
            xendit_invoice_url="https://checkout-staging.xendit.co/v2/inv-demand-match-1",
            xendit_external_id="ext-demand-match-1",
            paid_at=now - timedelta(days=2),
            created_at=now - timedelta(days=3)
        )
        # Deduct product stock for match txn
        p_cabai.quantity_kg -= 150.0
        
        session.add(dt_match)
        await session.flush()
        
        # Add payment transaction for demand matching
        pt_demand = PaymentTransaction(
            id=uuid.uuid4(),
            source_type="permintaan",
            source_id=dt_match.id,
            xendit_external_id=dt_match.xendit_external_id,
            amount=8550000.0,
            created_at=dt_match.paid_at
        )
        session.add(pt_demand)
        await session.flush()
        print("Demand requests, commitments, and matched transactions seeded.")

        # 7. Seed Ratings
        print("Seeding Ratings...")
        
        # Rating 1: Rating for Order 1
        rating1 = Rating(
            id=uuid.uuid4(),
            rater_id=buyer_sambal.id,
            rated_id=farmer_sugeng.id,
            role_context=RoleContext.AS_SELLER,
            transaction_type=TransactionType.PRODUCT_PURCHASE,
            reference_id=order1.id,
            score=5,
            comment="Cabai rawit merahnya sangat pedas dan masih segar saat tiba. Pengiriman super cepat!",
            created_at=order1.completed_at + timedelta(minutes=30)
        )
        
        # Rating 2: Rating for Demand Match 2
        rating2 = Rating(
            id=uuid.uuid4(),
            rater_id=farmer_sugeng.id,
            rated_id=buyer_sambal.id,
            role_context=RoleContext.AS_BUYER,
            transaction_type=TransactionType.DEMAND_FULFILLMENT,
            reference_id=dr_cabai.id,
            score=5,
            comment="Resto Sambal Gledek sangat kooperatif, pencocokan supply lancar dan pembayaran langsung lunas via platform.",
            created_at=dt_match.paid_at + timedelta(days=1)
        )
        
        session.add_all([rating1, rating2])
        await session.flush()
        print("Ratings seeded successfully.")

        # 8. Seed Conversations & Messages
        print("Seeding Conversations & Messages...")
        
        conv = Conversation(
            id=uuid.uuid4(),
            buyer_id=buyer_sambal.id,
            seller_id=farmer_sugeng.id,
            last_product_id=p_cabai.id,
            created_at=now - timedelta(days=3),
            last_message_at=now - timedelta(days=1)
        )
        session.add(conv)
        await session.flush()
        
        m1 = Message(
            id=uuid.uuid4(),
            conversation_id=conv.id,
            sender_id=buyer_sambal.id,
            content="Selamat pagi Pak Sugeng, apakah Cabai Rawit Merah ready 50kg hari ini untuk dikirim?",
            product_id=p_cabai.id,
            created_at=now - timedelta(days=3),
            read_at=now - timedelta(days=3) + timedelta(minutes=15)
        )
        
        m2 = Message(
            id=uuid.uuid4(),
            conversation_id=conv.id,
            sender_id=farmer_sugeng.id,
            content="Selamat pagi mas. Siap ready banyak mas. Kualitas bagus kering segar baru petik pagi ini.",
            product_id=p_cabai.id,
            created_at=now - timedelta(days=3) + timedelta(minutes=10),
            read_at=now - timedelta(days=3) + timedelta(minutes=15)
        )
        
        m3 = Message(
            id=uuid.uuid4(),
            conversation_id=conv.id,
            sender_id=buyer_sambal.id,
            content="Baik mas, saya buat order pembelian 20kg dulu ya lewat platform.",
            product_id=p_cabai.id,
            created_at=now - timedelta(days=3) + timedelta(minutes=12),
            read_at=now - timedelta(days=3) + timedelta(minutes=20)
        )
        
        m4 = Message(
            id=uuid.uuid4(),
            conversation_id=conv.id,
            sender_id=buyer_sambal.id,
            content="Pak Sugeng, untuk bawang merah kemarin kok agak basah ya mas? Di platform saya ajukan komplain dulu ya biar dicek admin.",
            created_at=now - timedelta(days=1),
            read_at=now - timedelta(days=1) + timedelta(hours=1)
        )
        
        m5 = Message(
            id=uuid.uuid4(),
            conversation_id=conv.id,
            sender_id=farmer_sugeng.id,
            content="Oh nggih mas mohon maaf sekali. Kemarin waktu packing di Bantul kehujanan gerimis sedikit. Silakan diajukan komplain nggih, nanti saya setujui untuk refund sebagian atau saya ganti barangnya.",
            created_at=now - timedelta(days=1) + timedelta(hours=1),
            read_at=now - timedelta(days=1) + timedelta(hours=1) + timedelta(minutes=10)
        )
        
        session.add_all([m1, m2, m3, m4, m5])
        await session.flush()
        print("Chat messages seeded.")

        # Commit everything to database
        await session.commit()
        print("Database transaction committed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
