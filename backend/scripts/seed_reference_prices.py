import os
import sys
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete, text
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
    print("Error: DATABASE_URL is not set.", flush=True)
    sys.exit(1)

engine = create_async_engine(DATABASE_URL, connect_args={"statement_cache_size": 0})
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

def get_base_price(commodity_name: str) -> float:
    name_lower = commodity_name.lower()
    if "sapi" in name_lower:
        return 135000.0
    elif "ayam ras" in name_lower or "daging ayam" in name_lower:
        return 36000.0
    elif "telur" in name_lower:
        return 29000.0
    elif "cabai rawit merah" in name_lower or "rawit merah" in name_lower:
        return 60000.0
    elif "cabai rawit" in name_lower:
        return 50000.0
    elif "cabai merah keriting" in name_lower:
        return 46000.0
    elif "cabai merah" in name_lower:
        return 44000.0
    elif "bawang merah" in name_lower:
        return 28000.0
    elif "bawang putih" in name_lower:
        return 38000.0
    elif "minyak goreng kemasan" in name_lower:
        return 19500.0
    elif "minyak goreng curah" in name_lower:
        return 16500.0
    elif "minyak goreng" in name_lower:
        return 18000.0
    elif "gula pasir premium" in name_lower:
        return 18500.0
    elif "gula pasir lokal" in name_lower:
        return 16800.0
    elif "gula pasir" in name_lower:
        return 17000.0
    elif "beras kualitas super i" in name_lower:
        return 16000.0
    elif "beras kualitas super ii" in name_lower:
        return 15500.0
    elif "beras kualitas medium i" in name_lower:
        return 14500.0
    elif "beras kualitas medium ii" in name_lower:
        return 14000.0
    elif "beras kualitas bawah" in name_lower:
        return 12500.0
    elif "beras" in name_lower:
        return 14000.0
    return 25000.0

async def main():
    print("--- Grove Reference Price Seeder (90 Days History) ---", flush=True)
    async with AsyncSessionLocal() as session:
        # 1. Fetch current commodities and regions to preserve the system's current categories
        print("Fetching unique commodities and regions from database...", flush=True)
        res_comms = await session.execute(select(ReferencePrice.commodity_name).distinct())
        commodities = res_comms.scalars().all()
        res_regs = await session.execute(select(ReferencePrice.region).distinct())
        regions = res_regs.scalars().all()

        if len(commodities) < 30:
            print("Fewer than 30 commodities found in DB. Using default complete list.", flush=True)
            commodities = [
                "Beras", "Beras Kualitas Medium I", "Beras Kualitas Medium II", "Beras Kualitas Super I",
                "Beras Kualitas Super II", "Beras Kualitas Bawah I", "Beras Kualitas Bawah II",
                "Bawang Merah", "Bawang Merah Ukuran Sedang", "Bawang Putih", "Bawang Putih Ukuran Sedang",
                "Cabai Merah", "Cabai Merah Keriting", "Cabai Merah Besar", "Cabai Rawit", "Cabai Rawit Merah",
                "Cabai Rawit Hijau", "Daging Ayam", "Daging Ayam Ras Segar", "Telur Ayam", "Telur Ayam Ras Segar",
                "Daging Sapi", "Daging Sapi Kualitas 1", "Daging Sapi Kualitas 2", "Minyak Goreng",
                "Minyak Goreng Curah", "Minyak Goreng Kemasan Bermerk 1", "Minyak Goreng Kemasan Bermerk 2",
                "Gula Pasir", "Gula Pasir Lokal", "Gula Pasir Kualitas Premium"
            ]
        if len(regions) < 30:
            print("Fewer than 30 regions found in DB. Using default complete list.", flush=True)
            regions = [
                "Nasional", "Aceh", "Bali", "Banten", "Bengkulu", "Di Yogyakarta", "Gorontalo", "Jambi",
                "Jawa Barat", "Jawa Tengah", "Jawa Timur", "Kalimantan Barat", "Kalimantan Selatan",
                "Kalimantan Tengah", "Kalimantan Timur", "Kalimantan Utara", "Kepulauan Bangka Belitung",
                "Kepulauan Riau", "Lampung", "Maluku", "Maluku Utara", "Nusa Tenggara Barat",
                "Papua", "Papua Barat", "Riau", "Sulawesi Barat", "Sulawesi Selatan",
                "Sulawesi Tengah", "Sulawesi Tenggara", "Sulawesi Utara", "Sumatera Barat",
                "Sumatera Selatan", "Sumatera Utara"
            ]

        print(f"Generating data for {len(commodities)} commodities across {len(regions)} regions.", flush=True)
        print(f"Total combinations: {len(commodities) * len(regions)}", flush=True)

        # Fetch latest prices to use as start/current price if available
        print("Fetching current prices to use as baseline...", flush=True)
        res_prices = await session.execute(
            select(ReferencePrice.commodity_name, ReferencePrice.region, ReferencePrice.price_per_kg)
            .order_by(ReferencePrice.scraped_at.desc())
        )
        latest_prices = {}
        for comm, reg, price in res_prices.all():
            key = (comm, reg)
            if key not in latest_prices:
                latest_prices[key] = price

        # Delete existing reference prices
        print("Clearing existing reference prices...", flush=True)
        await session.execute(delete(ReferencePrice))
        await session.commit()
        print("Cleared successfully.", flush=True)

        # Generate data
        records = []
        today = datetime.now(timezone.utc).replace(tzinfo=None)
        
        # We seed 90 days of data (from 90 days ago up to today)
        total_days = 90
        
        for comm in commodities:
            for reg in regions:
                # Find start price (target price for today)
                start_price = latest_prices.get((comm, reg))
                if not start_price or start_price <= 0:
                    start_price = get_base_price(comm)
                
                # We walk backwards from today (day 0) to day 89 (90 days ago)
                current_price = start_price
                
                # Generate list of daily prices first
                daily_prices = []
                for day in range(total_days):
                    daily_prices.append(current_price)
                    
                    # Random walk logic with mean reversion to start_price
                    # We are walking backward, so price_prev = price_curr * (1 + change)
                    change = random.uniform(-0.02, 0.02)
                    
                    # Mean reversion towards baseline
                    deviation = (start_price - current_price) / start_price
                    change += deviation * 0.05
                    
                    # Occasional price shocks (2% chance of 5-10% shock)
                    if random.random() < 0.02:
                        change += random.choice([-1, 1]) * random.uniform(0.05, 0.10)
                        
                    current_price = current_price * (1 + change)
                    
                    # Bound prices
                    min_price = start_price * 0.4
                    max_price = start_price * 2.0
                    current_price = max(min_price, min(max_price, current_price))
                    
                    # Round price to nearest Rp 100
                    current_price = round(current_price / 100.0) * 100.0
                
                # Now build records (from 90 days ago to today)
                for day_idx in range(total_days):
                    # day_idx = 0 represents 90 days ago, day_idx = 89 represents today
                    days_ago = total_days - 1 - day_idx
                    date = today - timedelta(days=days_ago)
                    
                    # Set a fixed hour (e.g. 08:00:00 UTC) to avoid timezone/hour discrepancies
                    dt = datetime(date.year, date.month, date.day, 8, 0, 0)
                    
                    price = daily_prices[days_ago]
                    
                    records.append({
                        "id": uuid.uuid4(),
                        "commodity_name": comm,
                        "price_per_kg": float(price),
                        "source": "PIHPS BI",
                        "region": reg,
                        "scraped_at": dt
                    })

        # Insert records in chunks using raw SQL for maximum performance
        print(f"Generated {len(records)} records. Writing to database via raw SQL (concurrently)...", flush=True)
        chunk_size = 1000
        
        sem = asyncio.Semaphore(10)
        
        async def insert_chunk(chunk_idx, chunk):
            # Construct raw SQL insert with bindparams
            bind_params = {}
            val_strs = []
            for idx, r in enumerate(chunk):
                val_strs.append(f"(:id_{idx}, :comm_{idx}, :price_{idx}, :source_{idx}, :reg_{idx}, :scraped_{idx})")
                bind_params[f"id_{idx}"] = r["id"]
                bind_params[f"comm_{idx}"] = r["commodity_name"]
                bind_params[f"price_{idx}"] = r["price_per_kg"]
                bind_params[f"source_{idx}"] = r["source"]
                bind_params[f"reg_{idx}"] = r["region"]
                bind_params[f"scraped_{idx}"] = r["scraped_at"]
                
            sql = f"INSERT INTO reference_prices (id, commodity_name, price_per_kg, source, region, scraped_at) VALUES {', '.join(val_strs)}"
            async with AsyncSessionLocal() as local_session:
                await local_session.execute(text(sql), bind_params)
                await local_session.commit()
            print(f"Inserted chunk {chunk_idx + 1}/{(len(records) + chunk_size - 1) // chunk_size} ({len(chunk)} rows)", flush=True)

        async def insert_chunk_with_retry(chunk_idx, chunk):
            async with sem:
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        # Timeout after 20 seconds, since raw SQL should be <1s
                        await asyncio.wait_for(insert_chunk(chunk_idx, chunk), timeout=20.0)
                        return
                    except Exception as e:
                        print(f"Warning: Chunk {chunk_idx + 1} insert failed or timed out (attempt {attempt + 1}/{max_retries}): {e}", flush=True)
                        if attempt == max_retries - 1:
                            raise e
                        await asyncio.sleep(2)

        tasks = []
        for chunk_idx, i in enumerate(range(0, len(records), chunk_size)):
            chunk = records[i:i+chunk_size]
            tasks.append(insert_chunk_with_retry(chunk_idx, chunk))
            
        await asyncio.gather(*tasks)
        print("--- Seeding Completed Successfully ---", flush=True)

if __name__ == '__main__':
    asyncio.run(main())
