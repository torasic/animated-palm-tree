import os
import sys
import asyncio
import math
import random
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from geoalchemy2 import WKTElement

# Add backend directory to sys.path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.models.reference_price import ReferencePrice
from app.services import embedding_service, price_matching_service

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    # Fallback to loading .env file if run directly from terminal without env vars
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL is not set.")
    sys.exit(1)

engine = create_async_engine(DATABASE_URL, connect_args={"statement_cache_size": 0})
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

# Coordinates for Yogyakarta Center
YOGYA_LAT = -7.7956
YOGYA_LNG = 110.3695

# Manually curated Unsplash photos - all verified to return HTTP 200
UNSPLASH_IMAGES = {
    "Beras": "https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=600&auto=format&fit=crop",
    # photo-1608797178974: returns 404 — replaced with verified red onion photo
    "Bawang Merah": "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?q=80&w=600&auto=format&fit=crop",
    "Bawang Putih": "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?q=80&w=600&auto=format&fit=crop",
    "Cabai Rawit": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?q=80&w=600&auto=format&fit=crop",
    # photo-1565191945116: returns 404 — replaced with verified red chili photo
    "Cabai Merah": "https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?q=80&w=600&auto=format&fit=crop",
    "Daging Ayam": "https://images.unsplash.com/photo-1604503468506-a8da13d82791?q=80&w=600&auto=format&fit=crop",
    "Telur Ayam": "https://images.unsplash.com/photo-1506976785307-8732e854ad03?q=80&w=600&auto=format&fit=crop",
    # photo-1603048588665: displays curry dish, not beef — replaced with verified raw beef photo
    "Daging Sapi": "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=600&auto=format&fit=crop",
    "Minyak Goreng": "https://images.unsplash.com/photo-1590779033100-9f60a05a013d?q=80&w=600&auto=format&fit=crop",
    # photo-1594911774802: returns 404 — replaced with verified sugar/sweet photo
    "Gula Pasir": "https://images.unsplash.com/photo-1581798459219-318e76aecc7b?q=80&w=600&auto=format&fit=crop"
}

FALLBACK_IMAGE = "https://images.unsplash.com/photo-1606787366850-de6330128bfc?q=80&w=600&auto=format&fit=crop"

# Definition of the 13 dummy products
# (Category, Base Name, Distance in km, Price Ratio group)
# Price Ratio groups: 
#   "green" (ratio >= 1.00), 
#   "yellow" (0.90 <= ratio < 1.00), 
#   "red" (ratio < 0.90)
DUMMY_PRODUCT_SPECS = [
    # Group 1: 5 Fair/Green products (price >= reference_price)
    ("Beras", "Beras Medium", 3.0, "green", 1.05),
    ("Bawang Merah", "Bawang Merah Super", 4.5, "green", 1.08),
    ("Bawang Putih", "Bawang Putih Kating", 12.0, "green", 1.03),
    ("Daging Ayam", "Daging Ayam Broiler Segar", 18.0, "green", 1.05),
    ("Telur Ayam", "Telur Ayam Ras Pilihan", 35.0, "green", 1.02),
    
    # Group 2: 4 Warning/Yellow products (slightly under, 0.90 <= ratio < 1.00)
    ("Cabai Rawit", "Cabai Rawit Hijau", 4.0, "yellow", 0.93),
    ("Gula Pasir", "Gula Pasir Lokal Madukismo", 16.0, "yellow", 0.92),
    ("Minyak Goreng", "Minyak Goreng Sawit", 21.0, "yellow", 0.95),
    ("Bawang Merah", "Bawang Merah Sedang", 42.0, "yellow", 0.94),
    
    # Group 3: 4 Unfair/Red products (far under, ratio < 0.90)
    ("Cabai Merah", "Cabai Merah Keriting", 5.2, "red", 0.82),
    ("Daging Sapi", "Daging Sapi Segar Jogja", 15.0, "red", 0.85),
    ("Cabai Rawit", "Cabai Rawit Merah Setan", 25.0, "red", 0.78),
    ("Beras", "Beras Premium Cianjur", 38.0, "red", 0.75)
]

def calculate_coords(lat, lng, dist_km):
    # Random angle
    angle = random.uniform(0, 2 * math.pi)
    # 1 degree of lat ~ 111 km
    delta_lat = (dist_km / 111.0) * math.cos(angle)
    # 1 degree of lng ~ 110 km
    delta_lng = (dist_km / 110.0) * math.sin(angle)
    return lat + delta_lat, lng + delta_lng

async def main():
    print("--- Grove Dummy Product Seeder ---")
    async with AsyncSessionLocal() as session:
        # 1. Cek atau buat user PETANI
        print("Finding PETANI user...")
        stmt = select(User).where(User.role == UserRole.PETANI)
        res = await session.execute(stmt)
        petani = res.scalars().first()
        
        if not petani:
            print("No PETANI user found. Creating 'Petani Demo'...")
            petani = User(
                email="petani.demo@example.com",
                google_sub="demo_petani_sub_12345",
                full_name="Petani Demo",
                role=UserRole.PETANI,
                phone_whatsapp="081234567890",
                location=WKTElement(f"POINT({YOGYA_LNG} {YOGYA_LAT})", srid=4326)
            )
            session.add(petani)
            await session.commit()
            await session.refresh(petani)
            print(f"Created Petani Demo user with ID: {petani.id}")
        else:
            print(f"Using existing PETANI user: {petani.full_name} ({petani.email})")

        # 2. Get latest reference prices to match commodity
        print("Fetching latest reference prices...")
        ref_prices = await price_matching_service.get_latest_reference_prices(session)
        print(f"Total reference price mappings found: {len(ref_prices)}")

        # 3. Create dummy products
        count = 0
        categories_count = {}
        
        # Loop 7 times to seed 91 products (to test 7+ pages with 12 products per page)
        for i in range(7):
            for cat, name, dist, group, ratio in DUMMY_PRODUCT_SPECS:
                var_name = f"{name} Var-{i+1}" if i > 0 else name
                var_dist = round(dist * (0.8 + 0.4 * random.random()), 1)
                var_ratio = ratio * (0.98 + 0.04 * random.random())

                # Determine coordinates
                p_lat, p_lng = calculate_coords(YOGYA_LAT, YOGYA_LNG, var_dist)
                loc = WKTElement(f"POINT({p_lng} {p_lat})", srid=4326)
                
                # Find reference price (based on clean name first)
                matched_ref = price_matching_service.find_reference_price(cat, cat, ref_prices)
                
                # Set price relative to reference
                if matched_ref is not None:
                    price = round(matched_ref * var_ratio)
                else:
                    # Fallback if no reference price matched
                    fallback_base = 15000.0
                    matched_ref = fallback_base
                    price = round(fallback_base * var_ratio)
                    print(f"Warning: No reference price for {cat}, using fallback base: {fallback_base}")
                    
                # Get Unsplash image
                photo_url = UNSPLASH_IMAGES.get(cat, FALLBACK_IMAGE)
                
                # Generate embedding using the same logic as API
                embedding_text = f"{var_name} {cat}"
                try:
                    embedding = await embedding_service.embedding_service.generate_embedding(embedding_text)
                except Exception as e:
                    print(f"Failed to generate embedding for '{var_name}': {e}")
                    embedding = None
                    
                # Create product with [DEMO] prefix
                demo_name = f"[DEMO] {var_name}"
                
                new_product = Product(
                    seller_id=petani.id,
                    name=demo_name,
                    category=cat.upper(),
                    quantity_kg=random.randint(20, 150),
                    price_per_kg=price,
                    reference_price_per_kg=matched_ref,
                    location=loc,
                    photo_url=photo_url,
                    embedding=embedding,
                    status=ProductStatus.TERSEDIA
                )
                
                session.add(new_product)
                count += 1
                categories_count[cat] = categories_count.get(cat, 0) + 1
                print(f"Seeded product {count}: {demo_name} ({cat}) | Price: Rp {price:,} (Ref: Rp {matched_ref:,}, Ratio: {var_ratio:.2f} [{group}]) | Distance: {var_dist}km")

        await session.commit()
        print("\n--- Seeding Completed Successfully ---")
        print(f"Total seeded products: {count}")
        print("Category distribution:")
        for k, v in categories_count.items():
            print(f" - {k}: {v}")

if __name__ == "__main__":
    asyncio.run(main())
