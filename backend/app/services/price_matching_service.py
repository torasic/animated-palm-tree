import difflib
from typing import Optional, Dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.reference_price import ReferencePrice

REGION_CENTERS = {
    "Di Yogyakarta": (-7.7956, 110.3695),
    "DKI Jakarta": (-6.2088, 106.8456),
    "Jawa Barat": (-6.9175, 107.6191),
    "Jawa Tengah": (-7.0000, 110.0000),
    "Jawa Timur": (-7.5360, 112.2384),
    "Banten": (-6.4058, 106.0640),
    "Bali": (-8.4095, 115.1889),
    "Nusa Tenggara Barat": (-8.6529, 117.3616),
    "Nusa Tenggara Timur": (-8.6573, 121.0794),
    "Aceh": (4.6951, 96.7494),
    "Sumatera Utara": (2.1154, 99.5451),
    "Sumatera Barat": (-0.7399, 100.8000),
    "Riau": (0.2933, 101.7068),
    "Kepulauan Riau": (3.9457, 108.1429),
    "Jambi": (-1.6101, 102.7758),
    "Sumatera Selatan": (-3.3194, 103.9144),
    "Bengkulu": (-3.7928, 102.2608),
    "Lampung": (-4.5586, 105.4000),
    "Kepulauan Bangka Belitung": (-2.7410, 106.4406),
    "Kalimantan Barat": (-0.2789, 111.4753),
    "Kalimantan Tengah": (-1.6814, 113.3824),
    "Kalimantan Selatan": (-3.0926, 115.2838),
    "Kalimantan Timur": (1.0819, 117.3000),
    "Kalimantan Utara": (3.0731, 116.0414),
    "Sulawesi Utara": (0.6274, 123.9750),
    "Sulawesi Tengah": (-1.4300, 121.4457),
    "Sulawesi Selatan": (-3.6687, 119.9740),
    "Sulawesi Tenggara": (-4.1449, 122.1746),
    "Gorontalo": (0.6999, 122.4550),
    "Sulawesi Barat": (-2.8441, 119.3323),
    "Maluku": (-3.2385, 130.1453),
    "Maluku Utara": (1.5700, 127.8000),
    "Papua": (-4.2699, 138.0803),
    "Papua Barat": (-1.3361, 132.5709),
}

def get_nearest_region(lat: float, lng: float) -> str:
    import math
    min_dist = float('inf')
    nearest = "Nasional"
    for region, center in REGION_CENTERS.items():
        dist = math.sqrt((lat - center[0])**2 + (lng - center[1])**2)
        if dist < min_dist:
            min_dist = dist
            nearest = region
    return nearest

async def get_latest_reference_prices(db: AsyncSession, region: str = "Nasional") -> Dict[str, float]:
    """
    Queries the reference_prices table, takes the latest row (based on scraped_at)
    for each unique commodity_name in the specified region (falling back to 'Nasional').
    """
    stmt = (
        select(ReferencePrice)
        .where(ReferencePrice.region == region)
        .distinct(ReferencePrice.commodity_name)
        .order_by(ReferencePrice.commodity_name, ReferencePrice.scraped_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    prices = {row.commodity_name: row.price_per_kg for row in rows}

    # Fallback to 'Nasional' for missing commodity_names
    if region != "Nasional":
        fallback_stmt = (
            select(ReferencePrice)
            .where(ReferencePrice.region == "Nasional")
            .distinct(ReferencePrice.commodity_name)
            .order_by(ReferencePrice.commodity_name, ReferencePrice.scraped_at.desc())
        )
        fallback_result = await db.execute(fallback_stmt)
        fallback_rows = fallback_result.scalars().all()
        for row in fallback_rows:
            if row.commodity_name not in prices:
                prices[row.commodity_name] = row.price_per_kg

    return prices

def find_reference_price(product_name: str, product_category: str, reference_prices: Dict[str, float]) -> Optional[float]:
    """
    Uses Python's difflib.get_close_matches to find the commodity_name closest to
    product_name (first), and falls back to product_category if not found.
    Uses a similarity cutoff of 0.6.
    Returns the matched price or None.
    """
    # Normalize keys and values
    normalized_prices = {name.lower(): price for name, price in reference_prices.items()}
    possibilities = list(normalized_prices.keys())
    
    # Try finding close match for product_name
    name_matches = difflib.get_close_matches(product_name.lower(), possibilities, n=1, cutoff=0.6)
    if name_matches:
        return normalized_prices[name_matches[0]]
        
    # Try finding close match for product_category
    category_matches = difflib.get_close_matches(product_category.lower(), possibilities, n=1, cutoff=0.6)
    if category_matches:
        return normalized_prices[category_matches[0]]
        
    return None
