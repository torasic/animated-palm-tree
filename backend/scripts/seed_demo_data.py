import os
import sys
import asyncio
import random
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from geoalchemy2 import WKTElement

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.user import User, UserRole
from app.models.demand_request import DemandRequest, DemandRequestStatus, SupplyCommitment
from app.services.embedding_service import embedding_service

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

# Yogyakarta Center GPS coordinate coordinates
YOGYA_LAT = -7.7956
YOGYA_LNG = 110.3695

DEMAND_MOCKS = [
    {"commodity": "Cabai Rawit Merah", "category": "SAYUR", "qty": 500, "committed_by_others": 150, "days_to_deadline": 14, "price": 48000},
    {"commodity": "Bawang Merah", "category": "SAYUR", "qty": 1200, "committed_by_others": 900, "days_to_deadline": 30, "price": 35000},
    {"commodity": "Telur Ayam Ras Segar", "category": "POKOK", "qty": 800, "committed_by_others": 780, "days_to_deadline": 8, "price": 24000},
    {"commodity": "Cabai Rawit Merah", "category": "SAYUR", "qty": 300, "committed_by_others": 0, "days_to_deadline": 25, "price": 30000},
    {"commodity": "Beras Kualitas Medium I", "category": "POKOK", "qty": 2000, "committed_by_others": 400, "days_to_deadline": 45, "price": 12500},
    {"commodity": "Bawang Putih Ukuran Sedang", "category": "SAYUR", "qty": 600, "committed_by_others": 50, "days_to_deadline": 12, "price": 32000},
    {"commodity": "Cabai Merah Besar", "category": "SAYUR", "qty": 400, "committed_by_others": 380, "days_to_deadline": 5, "price": 38000},
    {"commodity": "Daging Ayam", "category": "LAINNYA", "qty": 1000, "committed_by_others": 100, "days_to_deadline": 15, "price": 35000},
    {"commodity": "Cabai Merah Keriting", "category": "SAYUR", "qty": 450, "committed_by_others": 100, "days_to_deadline": 10, "price": 42000},
    {"commodity": "Cabai Hijau Besar", "category": "SAYUR", "qty": 350, "committed_by_others": 50, "days_to_deadline": 20, "price": 28000},
    {"commodity": "Tomat Merah Segar", "category": "SAYUR", "qty": 500, "committed_by_others": 200, "days_to_deadline": 12, "price": 15000},
    {"commodity": "Kentang Granola", "category": "SAYUR", "qty": 800, "committed_by_others": 300, "days_to_deadline": 18, "price": 18000},
    {"commodity": "Beras Cianjur Pandan Wangi", "category": "POKOK", "qty": 1500, "committed_by_others": 500, "days_to_deadline": 40, "price": 19000},
    {"commodity": "Daging Sapi Murni", "category": "LAINNYA", "qty": 250, "committed_by_others": 50, "days_to_deadline": 6, "price": 125000},
    {"commodity": "Wortel Lokal", "category": "SAYUR", "qty": 600, "committed_by_others": 120, "days_to_deadline": 15, "price": 12000},
    {"commodity": "Bayam Hijau Segar", "category": "SAYUR", "qty": 200, "committed_by_others": 180, "days_to_deadline": 4, "price": 8000},
    {"commodity": "Kubis/Kol Bulat", "category": "SAYUR", "qty": 700, "committed_by_others": 0, "days_to_deadline": 22, "price": 10000},
]

def offset_coords(lat, lng, idx):
    # Generates a tiny spread around Yogyakarta (within ~15km)
    random.seed(idx)
    offset_lat = random.uniform(-0.08, 0.08)
    offset_lng = random.uniform(-0.08, 0.08)
    return lat + offset_lat, lng + offset_lng

async def main():
    print("--- Grove Demo Data Seeder ---")
    async with AsyncSessionLocal() as session:
        # Create or fetch Buyers
        print("Seeding Buyers...")
        buyers = []
        buyer_configs = [
            {"email": "beringharjo@example.com", "sub": "sub_buyer_1", "phone": "08111111111", "name": "Koperasi Pasar Beringharjo"},
            {"email": "sambalgledek@example.com", "sub": "sub_buyer_2", "phone": "08122222222", "name": "Resto Sambal Gledek"},
            {"email": "sri_catering@example.com", "sub": "sub_buyer_3", "phone": "08133333333", "name": "Catering Ibu Sri"},
            {"email": "butum@example.com", "sub": "sub_buyer_4", "phone": "08144444444", "name": "Warung Makan Bu Tum"}
        ]
        for cfg in buyer_configs:
            stmt = select(User).where(User.email == cfg["email"])
            res = await session.execute(stmt)
            buyer = res.scalars().first()
            if not buyer:
                buyer = User(
                    email=cfg["email"],
                    google_sub=cfg["sub"],
                    full_name=cfg["name"],
                    phone_whatsapp=cfg["phone"],
                    role=UserRole.PEMBELI
                )
                session.add(buyer)
                print(f"Created Buyer: {cfg['name']}")
            buyers.append(buyer)
        
        # Create or fetch auxiliary farmers for supply commitments
        print("Seeding Auxiliary Farmers...")
        farmers = []
        farmer_configs = [
            {"email": "sugeng@example.com", "sub": "sub_farmer_1", "phone": "08577777771", "name": "Pak Sugeng (Sleman)"},
            {"email": "joko@example.com", "sub": "sub_farmer_2", "phone": "08577777772", "name": "Pak Joko (Bantul)"}
        ]
        for cfg in farmer_configs:
            stmt = select(User).where(User.email == cfg["email"])
            res = await session.execute(stmt)
            farmer = res.scalars().first()
            if not farmer:
                farmer = User(
                    email=cfg["email"],
                    google_sub=cfg["sub"],
                    full_name=cfg["name"],
                    phone_whatsapp=cfg["phone"],
                    role=UserRole.PETANI
                )
                session.add(farmer)
                print(f"Created Farmer: {cfg['name']}")
            farmers.append(farmer)
        
        await session.commit()
        
        # Refresh all users
        for b in buyers:
            await session.refresh(b)
        for f in farmers:
            await session.refresh(f)

        # Clear existing demand requests to prevent duplicates & over-clogging
        print("Cleaning up old demand requests...")
        await session.execute(delete(SupplyCommitment))
        await session.execute(delete(DemandRequest))
        await session.commit()

        # Seed DemandRequests
        print("Seeding Demand Requests & Commitments...")
        for i, mock in enumerate(DEMAND_MOCKS):
            buyer = buyers[i % len(buyers)]
            lat, lng = offset_coords(YOGYA_LAT, YOGYA_LNG, i)
            deadline_date = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=mock["days_to_deadline"])
            
            # Create request
            embedding_text = f"{mock['commodity']} {mock['category']}"
            try:
                emb = await embedding_service.generate_embedding(embedding_text)
            except Exception as e:
                print(f"Failed to generate embedding for '{mock['commodity']}': {e}")
                emb = None
            
            dr = DemandRequest(
                buyer_id=buyer.id,
                commodity_name=mock["commodity"],
                category=mock["category"],
                quantity_kg_needed=float(mock["qty"]),
                quantity_kg_committed=0.0,
                price_per_kg=float(mock["price"]),
                deadline=deadline_date,
                status=DemandRequestStatus.TERBUKA,
                location=WKTElement(f"POINT({lng} {lat})", srid=4326),
                embedding=emb
            )
            session.add(dr)
            await session.flush()  # get id

            # Seed commitment if mock has it
            committed = float(mock["committed_by_others"])
            if committed > 0:
                f1_qty = committed * 0.6
                f2_qty = committed * 0.4
                
                sc1 = SupplyCommitment(
                    demand_request_id=dr.id,
                    petani_id=farmers[0].id,
                    quantity_kg_committed=f1_qty
                )
                sc2 = SupplyCommitment(
                    demand_request_id=dr.id,
                    petani_id=farmers[1].id,
                    quantity_kg_committed=f2_qty
                )
                session.add(sc1)
                session.add(sc2)
                
                dr.quantity_kg_committed = committed
                if dr.quantity_kg_committed >= dr.quantity_kg_needed:
                    dr.status = DemandRequestStatus.TERPENUHI
            
            print(f"Created demand for {mock['commodity']} ({mock['qty']} KG) by {buyer.full_name}")

        await session.commit()
        print("Successfully seeded all demo data!")

if __name__ == "__main__":
    asyncio.run(main())
