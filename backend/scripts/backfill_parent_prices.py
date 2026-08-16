import asyncio
import os
import sys
import uuid
from datetime import datetime
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.reference_price import ReferencePrice

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

PARENT_CHILD_MAP = {
    "Beras": [
        "Beras Kualitas Bawah I",
        "Beras Kualitas Bawah II",
        "Beras Kualitas Medium I",
        "Beras Kualitas Medium II",
        "Beras Kualitas Super I",
        "Beras Kualitas Super II"
    ],
    "Bawang Merah": [
        "Bawang Merah Ukuran Sedang"
    ],
    "Bawang Putih": [
        "Bawang Putih Ukuran Sedang"
    ],
    "Cabai Merah": [
        "Cabai Merah Keriting",
        "Cabai Merah Besar"
    ],
    "Cabai Rawit": [
        "Cabai Rawit Merah",
        "Cabai Rawit Hijau"
    ],
    "Daging Ayam": [
        "Daging Ayam Ras Segar"
    ],
    "Telur Ayam": [
        "Telur Ayam Ras Segar"
    ],
    "Daging Sapi": [
        "Daging Sapi Kualitas 1",
        "Daging Sapi Kualitas 2"
    ],
    "Minyak Goreng": [
        "Minyak Goreng Curah",
        "Minyak Goreng Kemasan Bermerk 1",
        "Minyak Goreng Kemasan Bermerk 2"
    ],
    "Gula Pasir": [
        "Gula Pasir Lokal",
        "Gula Pasir Kualitas Premium"
    ]
}

async def main():
    print("--- Grove Parent Prices Backfill ---")
    async with AsyncSessionLocal() as db:
        print("Fetching all reference prices from database...")
        res = await db.execute(select(ReferencePrice))
        all_records = res.scalars().all()
        print(f"Fetched {len(all_records)} records.")
        
        # Group records by (region, date)
        grouped = defaultdict(list)
        for r in all_records:
            date_key = r.scraped_at.date()
            grouped[(r.region, date_key)].append(r)
            
        print(f"Total region-date groups: {len(grouped)}")
        
        new_records_to_create = []
        
        for (region, date_key), records in grouped.items():
            # Get names of commodities present in this group
            present_comms = {r.commodity_name: r for r in records}
            
            for parent, children in PARENT_CHILD_MAP.items():
                if parent not in present_comms:
                    # Parent is missing! Check if any children are present
                    child_prices = []
                    child_scraped_at = None
                    for child in children:
                        if child in present_comms:
                            child_prices.append(present_comms[child].price_per_kg)
                            if not child_scraped_at:
                                child_scraped_at = present_comms[child].scraped_at
                                
                    if child_prices:
                        avg_price = sum(child_prices) / len(child_prices)
                        # Round to nearest 100 rupiah
                        avg_price = round(avg_price / 100.0) * 100.0
                        
                        new_records_to_create.append(ReferencePrice(
                            id=uuid.uuid4(),
                            commodity_name=parent,
                            price_per_kg=float(avg_price),
                            source="PIHPS BI (Calculated Average)",
                            region=region,
                            scraped_at=child_scraped_at
                        ))
                        
        if new_records_to_create:
            print(f"Creating {len(new_records_to_create)} new parent commodity price records...")
            db.add_all(new_records_to_create)
            await db.commit()
            print("Successfully backfilled database records.")
        else:
            print("No missing parent records found to backfill.")

if __name__ == '__main__':
    asyncio.run(main())
