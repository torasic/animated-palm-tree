from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db import get_db
from app.models.reference_price import ReferencePrice
from app.models.product import Product, ProductStatus
from app.models.scraper_status import ScraperStatus
from app.schemas.reference_price import PaginatedReferencePrices
from typing import Optional
from datetime import datetime, timedelta, timezone
from app.services.divergence_service import divergence_service
from app.services.groq_service import groq_service
from app.services.divergence_cache import divergence_cache
import json
import asyncio
import time
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory TTL caches
# ---------------------------------------------------------------------------
# distinct_commodities: changes only when scrapers run (at most daily)
_commodities_cache: dict = {"data": None, "expires_at": 0.0}
_COMMODITIES_TTL = 3600  # 1 hour

# /history: scraped data is updated at most daily — safe to cache 6 hours
_history_cache: dict = {}
_HISTORY_TTL = 21600  # 6 hours

router = APIRouter(prefix="/reference-prices", tags=["reference-prices"])

def standardize_region(region: Optional[str]) -> Optional[str]:
    if not region:
        return region
    reg_lower = region.lower().strip()
    if reg_lower == "dki jakarta":
        return "DKI Jakarta"
    if reg_lower == "di yogyakarta":
        return "Di Yogyakarta"
    return region.title()

@router.get("", response_model=PaginatedReferencePrices)
async def get_reference_prices(
    commodity: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    region = standardize_region(region)
    # Distinct commodities — cached for 1 hour (only changes when scrapers run)
    now = time.monotonic()
    if _commodities_cache["data"] is None or now > _commodities_cache["expires_at"]:
        stmt_distinct = select(ReferencePrice.commodity_name).distinct().order_by(ReferencePrice.commodity_name)
        res_distinct = await db.execute(stmt_distinct)
        _commodities_cache["data"] = list(res_distinct.scalars().all())
        _commodities_cache["expires_at"] = now + _COMMODITIES_TTL
        logger.debug("distinct_commodities cache refreshed")
    distinct_commodities = _commodities_cache["data"]

    # Build query
    query = select(ReferencePrice)
    if commodity:
        query = query.where(ReferencePrice.commodity_name == commodity)
    if region:
        query = query.where(ReferencePrice.region == region)
    if search:
        query = query.where(
            (ReferencePrice.commodity_name.ilike(f"%{search}%")) |
            (ReferencePrice.region.ilike(f"%{search}%"))
        )

    # Deduplicate by commodity_name and region, getting the latest entry (scraped_at DESC)
    query = query.distinct(ReferencePrice.commodity_name, ReferencePrice.region).order_by(
        ReferencePrice.commodity_name,
        ReferencePrice.region,
        ReferencePrice.scraped_at.desc()
    )

    # Total matching count
    count_query = select(func.count()).select_from(query.subquery())
    res_count = await db.execute(count_query)
    total = res_count.scalar() or 0

    # Pagination
    paginated_query = query.offset((page - 1) * limit).limit(limit)
    res_items = await db.execute(paginated_query)
    items = res_items.scalars().all()

    pages = (total + limit - 1) // limit if limit > 0 else 0

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages,
        "distinct_commodities": distinct_commodities
    }

@router.get("/count")
async def get_reference_prices_count(db: AsyncSession = Depends(get_db)):
    # 1. Total reference price entries count
    stmt_count = select(func.count(ReferencePrice.id))
    count_res = await db.execute(stmt_count)
    total_commodities = count_res.scalar() or 0

    # 2. Latest update time (max scraped_at)
    stmt_max = select(func.max(ReferencePrice.scraped_at))
    max_res = await db.execute(stmt_max)
    last_updated = max_res.scalar()

    # 3. Total active products count
    stmt_prod = select(func.count(Product.id)).where(Product.status == ProductStatus.TERSEDIA)
    prod_res = await db.execute(stmt_prod)
    active_products = prod_res.scalar() or 0

    # 4. Actual last scraped time from scraper_statuses
    stmt_scraper = select(ScraperStatus.last_run_at).order_by(ScraperStatus.last_run_at.desc()).limit(1)
    scraper_res = await db.execute(stmt_scraper)
    last_scraped_at = scraper_res.scalar_one_or_none()

    if last_updated:
        last_updated = last_updated.replace(tzinfo=timezone.utc)
    if last_scraped_at:
        last_scraped_at = last_scraped_at.replace(tzinfo=timezone.utc)

    return {
        "total_commodities": total_commodities,
        "last_updated": last_updated,
        "active_products": active_products,
        "last_scraped_at": last_scraped_at
    }

@router.get("/history")
async def get_reference_prices_history(
    commodity: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    days: Optional[int] = Query(30),
    db: AsyncSession = Depends(get_db)
):
    region = standardize_region(region)

    # In-memory cache: scraped data changes at most daily, safe to cache 6 hours
    cache_key = (commodity, region, days)
    now = time.monotonic()
    cached_entry = _history_cache.get(cache_key)
    if cached_entry and now < cached_entry["expires_at"]:
        logger.debug("history cache hit: %s", cache_key)
        return cached_entry["data"]

    query = select(ReferencePrice)
    if commodity:
        query = query.where(ReferencePrice.commodity_name == commodity)
    if region:
        query = query.where(ReferencePrice.region == region)
    if days:
        # Fetch slightly more history to help with initial forward fill
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days + 15)
        query = query.where(ReferencePrice.scraped_at >= cutoff)

    query = query.order_by(ReferencePrice.scraped_at.asc())

    res = await db.execute(query)
    items = res.scalars().all()

    if not items:
        return []

    # Map date to latest price entry
    date_to_item = {}
    for item in items:
        d_key = item.scraped_at.date()
        date_to_item[d_key] = item

    # Target date range is from (today - days + 1) to today
    end_date = datetime.now(timezone.utc).replace(tzinfo=None).date()
    # In case DB has slightly more recent date
    max_db_date = max(item.scraped_at.date() for item in items)
    if max_db_date > end_date:
        end_date = max_db_date

    start_date = end_date - timedelta(days=(days or 30) - 1)

    # Pre-populate last seen price from history before start_date
    last_price = None
    last_source = None
    for item in items:
        if item.scraped_at.date() < start_date:
            last_price = item.price_per_kg
            last_source = item.source
        else:
            break

    # Fallback price in case we have no data before start_date
    fallback_price = items[0].price_per_kg
    fallback_source = items[0].source

    history = []
    current_date = start_date
    while current_date <= end_date:
        if current_date in date_to_item:
            item = date_to_item[current_date]
            last_price = item.price_per_kg
            last_source = item.source

            history.append({
                "id": str(item.id),
                "commodity_name": item.commodity_name,
                "price_per_kg": item.price_per_kg,
                "source": item.source,
                "region": item.region,
                "scraped_at": item.scraped_at.isoformat()
            })
        else:
            price = last_price if last_price is not None else fallback_price
            source = last_source if last_source is not None else fallback_source

            # Use 08:00:00 as the standardized timestamp for interpolated entries
            dt = datetime.combine(current_date, datetime.min.time()) + timedelta(hours=8)

            history.append({
                "id": None,
                "commodity_name": commodity or "Unknown",
                "price_per_kg": price,
                "source": f"{source} (Interpolated)",
                "region": region or "Nasional",
                "scraped_at": dt.isoformat()
            })
        current_date += timedelta(days=1)

    # Store in cache
    _history_cache[cache_key] = {"data": history, "expires_at": now + _HISTORY_TTL}
    logger.debug("history cache miss, stored: %s", cache_key)
    return history


@router.get("/divergence")
async def get_price_divergence(
    commodity: str = Query(..., description="Nama komoditas"),
    region: str = Query("Nasional", description="Nama region"),
    days: int = Query(90, ge=7, le=365, description="Rentang hari data historis"),
    db: AsyncSession = Depends(get_db)
):
    region = standardize_region(region)
    # Check cache first
    cached = await divergence_cache.get(db, commodity, region, days)
    if cached:
        return cached

    query = select(ReferencePrice)
    query = query.where(ReferencePrice.commodity_name == commodity)
    query = query.where(ReferencePrice.region == region)
    
    # Fetch slightly more history to help with initial forward fill
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days + 15)
    query = query.where(ReferencePrice.scraped_at >= cutoff)
    query = query.order_by(ReferencePrice.scraped_at.asc())
    
    res = await db.execute(query)
    items = res.scalars().all()
    
    if not items:
        return {
            "commodity_name": commodity,
            "region": region,
            "days": days,
            "divergence_score": 0.0,
            "classification": "Stabil/Fluktuasi Normal",
            "average_oscillation_amplitude": 0.0,
            "average_oscillation_frequency_days": 0.0,
            "explanation": "Tidak ada data historis yang tersedia untuk komoditas dan wilayah ini.",
            "historical_data_points": 0
        }

    # Map date to latest price entry
    date_to_item = {}
    for item in items:
        d_key = item.scraped_at.date()
        date_to_item[d_key] = item

    # Target date range is from (today - days + 1) to today
    end_date = datetime.now(timezone.utc).replace(tzinfo=None).date()
    max_db_date = max(item.scraped_at.date() for item in items)
    if max_db_date > end_date:
        end_date = max_db_date

    start_date = end_date - timedelta(days=days - 1)

    # Pre-populate last seen price from history before start_date
    last_price = None
    for item in items:
        if item.scraped_at.date() < start_date:
            last_price = item.price_per_kg
        else:
            break

    fallback_price = items[0].price_per_kg

    filled_prices = []
    current_date = start_date
    while current_date <= end_date:
        if current_date in date_to_item:
            last_price = date_to_item[current_date].price_per_kg
            filled_prices.append(last_price)
        else:
            price = last_price if last_price is not None else fallback_price
            filled_prices.append(price)
        current_date += timedelta(days=1)

    # Calculate statistics — CPU-bound sync work, offload to thread pool
    stats = await asyncio.to_thread(divergence_service.calculate_divergence, filled_prices)

    # Generate natural language explanation via Groq
    explanation = await groq_service.generate_explanation(
        commodity_name=commodity,
        region=region,
        days=days,
        current_price=stats["current_price"],
        price_change_pct=stats["price_change_pct"],
        divergence_score=stats["divergence_score"],
        classification=stats["classification"],
        avg_amplitude=stats["average_oscillation_amplitude"],
        avg_frequency=stats["average_oscillation_frequency_days"]
    )

    result = {
        "commodity_name": commodity,
        "region": region,
        "days": days,
        "divergence_score": stats["divergence_score"],
        "classification": stats["classification"],
        "average_oscillation_amplitude": stats["average_oscillation_amplitude"],
        "average_oscillation_frequency_days": stats["average_oscillation_frequency_days"],
        "explanation": explanation,
        "historical_data_points": len(filled_prices)
    }

    # Store in daily cache
    await divergence_cache.set(db, commodity, region, days, result)
    return result


@router.get("/divergence/stream")
async def get_price_divergence_stream(
    commodity: str = Query(..., description="Nama komoditas"),
    region: str = Query("Nasional", description="Nama region"),
    days: int = Query(90, ge=7, le=365, description="Rentang hari data historis"),
    db: AsyncSession = Depends(get_db)
):
    region = standardize_region(region)
    async def event_generator():
        # Check cache first
        cached = await divergence_cache.get(db, commodity, region, days)
        if cached:
            # Yield stats type message
            stats_msg = {
                "type": "stats",
                "data": {
                    "commodity_name": cached["commodity_name"],
                    "region": cached["region"],
                    "days": cached["days"],
                    "divergence_score": cached["divergence_score"],
                    "classification": cached["classification"],
                    "average_oscillation_amplitude": cached["average_oscillation_amplitude"],
                    "average_oscillation_frequency_days": cached["average_oscillation_frequency_days"],
                    "historical_data_points": cached["historical_data_points"]
                }
            }
            yield f"data: {json.dumps(stats_msg)}\n\n"
            await asyncio.sleep(0.1)

            # Yield explanation chunk-by-chunk for typing effect
            explanation = cached["explanation"]
            chunk_size = 8
            for i in range(0, len(explanation), chunk_size):
                chunk = explanation[i:i + chunk_size]
                chunk_msg = {
                    "type": "chunk",
                    "text": chunk
                }
                yield f"data: {json.dumps(chunk_msg)}\n\n"
                await asyncio.sleep(0.02)
            return

        # If not cached, compute stats
        query = select(ReferencePrice)
        query = query.where(ReferencePrice.commodity_name == commodity)
        query = query.where(ReferencePrice.region == region)
        
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days + 15)
        query = query.where(ReferencePrice.scraped_at >= cutoff)
        query = query.order_by(ReferencePrice.scraped_at.asc())
        
        res = await db.execute(query)
        items = res.scalars().all()
        
        if not items:
            error_stats = {
                "commodity_name": commodity,
                "region": region,
                "days": days,
                "divergence_score": 0.0,
                "classification": "Stabil/Fluktuasi Normal",
                "average_oscillation_amplitude": 0.0,
                "average_oscillation_frequency_days": 0.0,
                "historical_data_points": 0
            }
            yield f"data: {json.dumps({'type': 'stats', 'data': error_stats})}\n\n"
            yield f"data: {json.dumps({'type': 'chunk', 'text': 'Tidak ada data historis yang tersedia untuk komoditas dan wilayah ini.'})}\n\n"
            return

        date_to_item = {}
        for item in items:
            d_key = item.scraped_at.date()
            date_to_item[d_key] = item

        end_date = datetime.now(timezone.utc).replace(tzinfo=None).date()
        max_db_date = max(item.scraped_at.date() for item in items)
        if max_db_date > end_date:
            end_date = max_db_date

        start_date = end_date - timedelta(days=days - 1)

        last_price = None
        for item in items:
            if item.scraped_at.date() < start_date:
                last_price = item.price_per_kg
            else:
                break

        fallback_price = items[0].price_per_kg

        filled_prices = []
        current_date = start_date
        while current_date <= end_date:
            if current_date in date_to_item:
                last_price = date_to_item[current_date].price_per_kg
                filled_prices.append(last_price)
            else:
                price = last_price if last_price is not None else fallback_price
                filled_prices.append(price)
            current_date += timedelta(days=1)

        # Calculate statistics — CPU-bound sync work, offload to thread pool
        stats = await asyncio.to_thread(divergence_service.calculate_divergence, filled_prices)

        # Yield stats to client immediately
        stats_payload = {
            "commodity_name": commodity,
            "region": region,
            "days": days,
            "divergence_score": stats["divergence_score"],
            "classification": stats["classification"],
            "average_oscillation_amplitude": stats["average_oscillation_amplitude"],
            "average_oscillation_frequency_days": stats["average_oscillation_frequency_days"],
            "historical_data_points": len(filled_prices)
        }
        yield f"data: {json.dumps({'type': 'stats', 'data': stats_payload})}\n\n"
        await asyncio.sleep(0.1)

        # Stream explanation from LLM
        full_explanation_list = []
        async for chunk in groq_service.generate_explanation_stream(
            commodity_name=commodity,
            region=region,
            days=days,
            current_price=stats["current_price"],
            price_change_pct=stats["price_change_pct"],
            divergence_score=stats["divergence_score"],
            classification=stats["classification"],
            avg_amplitude=stats["average_oscillation_amplitude"],
            avg_frequency=stats["average_oscillation_frequency_days"]
        ):
            full_explanation_list.append(chunk)
            chunk_msg = {
                "type": "chunk",
                "text": chunk
            }
            yield f"data: {json.dumps(chunk_msg)}\n\n"

        full_explanation = "".join(full_explanation_list)

        # Cache the complete result for next requests
        cache_payload = {
            "commodity_name": commodity,
            "region": region,
            "days": days,
            "divergence_score": stats["divergence_score"],
            "classification": stats["classification"],
            "average_oscillation_amplitude": stats["average_oscillation_amplitude"],
            "average_oscillation_frequency_days": stats["average_oscillation_frequency_days"],
            "explanation": full_explanation,
            "historical_data_points": len(filled_prices)
        }
        await divergence_cache.set(db, commodity, region, days, cache_payload)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/cobweb/stream")
async def get_price_cobweb_stream(
    commodity: str = Query(..., description="Nama komoditas"),
    region: str = Query("Nasional", description="Nama region"),
    days: int = Query(90, ge=7, le=365, description="Rentang hari data historis untuk ekuilibrium"),
    es: float = Query(0.8, ge=0.0, le=5.0, description="Elastisitas Penawaran (Es)"),
    ed: float = Query(1.0, ge=0.01, le=5.0, description="Elastisitas Permintaan (Ed)"),
    periods: int = Query(8, ge=3, le=20, description="Jumlah periode simulasi"),
    db: AsyncSession = Depends(get_db)
):
    region = standardize_region(region)
    async def event_generator():
        query = select(ReferencePrice)
        query = query.where(ReferencePrice.commodity_name == commodity)
        query = query.where(ReferencePrice.region == region)
        
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days + 15)
        query = query.where(ReferencePrice.scraped_at >= cutoff)
        query = query.order_by(ReferencePrice.scraped_at.asc())
        
        res = await db.execute(query)
        items = res.scalars().all()
        
        if not items:
            error_payload = {
                "prices": [0.0] * (periods + 1),
                "equilibrium_price": 0.0,
                "initial_price": 0.0,
                "es": es,
                "ed": ed,
                "periods": periods
            }
            yield f"data: {json.dumps({'type': 'simulation', 'data': error_payload})}\n\n"
            yield f"data: {json.dumps({'type': 'chunk', 'text': 'Tidak ada data historis untuk komoditas dan wilayah ini.'})}\n\n"
            return

        date_to_item = {}
        for item in items:
            d_key = item.scraped_at.date()
            date_to_item[d_key] = item

        end_date = datetime.now(timezone.utc).replace(tzinfo=None).date()
        max_db_date = max(item.scraped_at.date() for item in items)
        if max_db_date > end_date:
            end_date = max_db_date

        start_date = end_date - timedelta(days=days - 1)

        last_price = None
        for item in items:
            if item.scraped_at.date() < start_date:
                last_price = item.price_per_kg
            else:
                break

        fallback_price = items[0].price_per_kg

        filled_prices = []
        current_date = start_date
        while current_date <= end_date:
            if current_date in date_to_item:
                last_price = date_to_item[current_date].price_per_kg
                filled_prices.append(last_price)
            else:
                price = last_price if last_price is not None else fallback_price
                filled_prices.append(price)
            current_date += timedelta(days=1)

        P_0 = sum(filled_prices) / len(filled_prices)
        P_init = filled_prices[-1]

        simulated_prices = [P_init]
        ratio = es / ed
        for t in range(1, periods + 1):
            next_price = (1.0 + ratio) * P_0 - ratio * simulated_prices[-1]
            if next_price < 0:
                next_price = 0.0
            simulated_prices.append(next_price)

        simulation_payload = {
            "prices": simulated_prices,
            "equilibrium_price": P_0,
            "initial_price": P_init,
            "es": es,
            "ed": ed,
            "periods": periods
        }
        yield f"data: {json.dumps({'type': 'simulation', 'data': simulation_payload})}\n\n"
        await asyncio.sleep(0.1)

        async for chunk in groq_service.generate_cobweb_explanation_stream(
            commodity_name=commodity,
            region=region,
            periods=periods,
            simulated_prices=simulated_prices,
            user_elasticity_supply=es,
            user_elasticity_demand=ed
        ):
            chunk_msg = {
                "type": "chunk",
                "text": chunk
            }
            yield f"data: {json.dumps(chunk_msg)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

