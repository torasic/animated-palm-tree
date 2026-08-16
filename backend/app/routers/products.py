import json
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text, func
from typing import List, Optional
from uuid import UUID

from app.db import get_db
from app.models.user import User, UserRole
from app.models.product import Product, ProductStatus
from app.schemas.product import ProductResponse, ProductUpdate
from app.services import auth_service, storage_service, embedding_service, price_matching_service
from geoalchemy2 import WKTElement

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/products", tags=["products"])

def _format_product_row(row) -> dict:
    lat = row.latitude
    lng = row.longitude
    region_name = "Nasional"
    if lat is not None and lng is not None:
        region_name = price_matching_service.get_nearest_region(lat, lng)

    data = {
        "id": row.id,
        "seller_id": row.seller_id,
        "name": row.name,
        "category": row.category,
        "quantity_kg": row.quantity_kg,
        "price_per_kg": row.price_per_kg,
        "reference_price_per_kg": row.reference_price_per_kg,
        "status": row.status,
        "photo_url": row.photo_url,
        "created_at": row.created_at,
        "latitude": lat,
        "longitude": lng,
        "region": region_name,
        "seller_name": row.seller_name,
        "seller_phone": row.seller_phone,
        "seller_rating_avg": row.seller_rating_avg,
        "seller_rating_count": row.seller_rating_count
    }

    if hasattr(row, 'distance_km'):
        data['distance_km'] = row.distance_km
    return data

async def _get_product_by_id(product_id: UUID, db: AsyncSession) -> dict:
    sql = text("""
        SELECT p.id, p.seller_id, p.name, p.category, p.quantity_kg, p.price_per_kg, p.reference_price_per_kg, p.status, p.photo_url, p.created_at,
               ST_Y(p.location::geometry) as latitude, ST_X(p.location::geometry) as longitude,
               u.full_name as seller_name, u.phone_whatsapp as seller_phone, u.seller_rating_avg, u.seller_rating_count
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.id = :product_id
    """)
    result = await db.execute(sql, {"product_id": product_id})
    row = result.first()
    if not row:
        return None
    return _format_product_row(row)


@router.post("", response_model=ProductResponse)
async def create_product(
    name: str = Form(...),
    category: str = Form(...),
    quantity_kg: float = Form(...),
    price_per_kg: float = Form(...),
    photo: UploadFile = File(...),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    if current_user.role != UserRole.PETANI:
        raise HTTPException(status_code=403, detail="Only farmers/livestock breeders can post products")
    
    photo_url = await storage_service.upload_product_photo(photo)
    
    # Generate semantic embedding from name and category
    embedding_text = f"{name} {category}"
    embedding = await embedding_service.embedding_service.generate_embedding(embedding_text)
    
    product_location = None
    product_lat = lat
    product_lng = lng
    if lat is not None and lng is not None:
        product_location = WKTElement(f"POINT({lng} {lat})", srid=4326)
    elif current_user.location is not None:
        product_location = current_user.location
        product_lat = current_user.latitude
        product_lng = current_user.longitude

    region = "Nasional"
    if product_lat is not None and product_lng is not None:
        region = price_matching_service.get_nearest_region(product_lat, product_lng)

    reference_price = None
    try:
        ref_prices = await price_matching_service.get_latest_reference_prices(db, region=region)
        reference_price = price_matching_service.find_reference_price(name, category, ref_prices)
    except Exception as e:
        logger.warning(f"Failed to match reference price: {e}")

    if reference_price is None:
        raise HTTPException(
            status_code=400,
            detail="Produk tidak terdaftar dalam acuan harga PIHPS Bank Indonesia. Penjualan produk tidak diizinkan."
        )

    new_product = Product(
        seller_id=current_user.id,
        name=name,
        category=category,
        quantity_kg=quantity_kg,
        price_per_kg=price_per_kg,
        photo_url=photo_url,
        status=ProductStatus.TERSEDIA,
        embedding=embedding,
        location=product_location,
        reference_price_per_kg=reference_price
    )
    
    db.add(new_product)
    await db.commit()
    await db.refresh(new_product)
    product_detail = await _get_product_by_id(new_product.id, db)
    if not product_detail:
        raise HTTPException(status_code=404, detail="Failed to retrieve created product")
    return product_detail

@router.get("", response_model=List[ProductResponse])
async def list_products(
    seller_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    params = {"skip": skip, "limit": limit}
    where_clause = "WHERE p.status = 'TERSEDIA'"
    if seller_id:
        where_clause += " AND p.seller_id = :seller_id"
        params["seller_id"] = seller_id

    sql = text(f"""
        SELECT p.id, p.seller_id, p.name, p.category, p.quantity_kg, p.price_per_kg, p.reference_price_per_kg, p.status, p.photo_url, p.created_at,
               ST_Y(p.location::geometry) as latitude, ST_X(p.location::geometry) as longitude,
               u.full_name as seller_name, u.phone_whatsapp as seller_phone, u.seller_rating_avg, u.seller_rating_count
        FROM products p
        JOIN users u ON p.seller_id = u.id
        {where_clause}
        ORDER BY p.created_at DESC
        OFFSET :skip
        LIMIT :limit
    """)
    result = await db.execute(sql, params)
    
    products = []
    for row in result:
        products.append(_format_product_row(row))
    return products

@router.get("/count")
async def get_products_count(db: AsyncSession = Depends(get_db)):
    sql = text("SELECT COUNT(*) FROM products WHERE status = 'TERSEDIA'")
    result = await db.execute(sql)
    count = result.scalar() or 0
    return {"count": count}

@router.get("/personal-stats")
async def get_personal_stats(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(auth_service.get_optional_current_user)
):
    # Calculate WIB start of today in UTC
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    wib_now = now_utc + timedelta(hours=7)
    wib_today_start = datetime(wib_now.year, wib_now.month, wib_now.day)
    utc_today_start = wib_today_start - timedelta(hours=7)

    # Count products created today
    stmt_today = select(func.count(Product.id)).where(Product.created_at >= utc_today_start)
    result_today = await db.execute(stmt_today)
    new_products_today_count = result_today.scalar() or 0

    # Count user active products if they are a farmer
    user_active_products_count = 0
    if current_user and current_user.role == UserRole.PETANI:
        stmt_user = select(func.count(Product.id)).where(
            Product.seller_id == current_user.id,
            Product.status == ProductStatus.TERSEDIA
        )
        result_user = await db.execute(stmt_user)
        user_active_products_count = result_user.scalar() or 0

    return {
        "user_active_products_count": user_active_products_count,
        "new_products_today_count": new_products_today_count
    }

@router.get("/nearby", response_model=List[ProductResponse])
async def get_nearby_products(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(10, ge=1, le=100),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Find products within a radius using PostGIS.
    """
    # Use raw SQL to leverage PostGIS geography functions
    sql = text("""
        SELECT p.id, p.seller_id, p.name, p.category, p.quantity_kg, p.price_per_kg, p.reference_price_per_kg, p.status, p.photo_url, p.created_at,
               ST_Y(p.location::geometry) as latitude, ST_X(p.location::geometry) as longitude,
               ST_Distance(p.location, ST_MakePoint(:lng, :lat)::geography) / 1000 as distance_km,
               u.full_name as seller_name, u.phone_whatsapp as seller_phone, u.seller_rating_avg, u.seller_rating_count
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.status = 'TERSEDIA' 
          AND ST_DWithin(p.location, ST_MakePoint(:lng, :lat)::geography, :radius_meters)
        ORDER BY distance_km ASC
        LIMIT :limit
    """)
    
    result = await db.execute(sql, {
        "lng": lng, 
        "lat": lat, 
        "radius_meters": radius_km * 1000,
        "limit": limit
    })
    
    products = []
    for row in result:
        products.append(_format_product_row(row))
        
    return products

@router.get("/me", response_model=List[ProductResponse])
async def list_my_products(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    if current_user.role != UserRole.PETANI:
        raise HTTPException(status_code=403, detail="Only farmers/livestock breeders have listed products")
        
    sql = text("""
        SELECT p.id, p.seller_id, p.name, p.category, p.quantity_kg, p.price_per_kg, p.reference_price_per_kg, p.status, p.photo_url, p.created_at,
               ST_Y(p.location::geometry) as latitude, ST_X(p.location::geometry) as longitude,
               u.full_name as seller_name, u.phone_whatsapp as seller_phone, u.seller_rating_avg, u.seller_rating_count
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.seller_id = :seller_id AND p.status = 'TERSEDIA'
        ORDER BY p.created_at DESC
    """)
    result = await db.execute(sql, {"seller_id": current_user.id})
    
    products = []
    for row in result:
        products.append(_format_product_row(row))
    return products

@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: UUID, db: AsyncSession = Depends(get_db)):
    product_detail = await _get_product_by_id(product_id, db)
    if not product_detail:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_detail

@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    product_data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if product.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own products")
    
    update_data = product_data.model_dump(exclude_unset=True)
    
    new_name = update_data.get("name", product.name)
    new_category = update_data.get("category", product.category)
    
    if "name" in update_data or "category" in update_data:
        reference_price = None
        try:
            ref_prices = await price_matching_service.get_latest_reference_prices(db)
            reference_price = price_matching_service.find_reference_price(new_name, new_category, ref_prices)
        except Exception as e:
            logger.warning(f"Failed to match reference price on update: {e}")
            
        if reference_price is None:
            raise HTTPException(
                status_code=400,
                detail="Produk tidak terdaftar dalam acuan harga PIHPS Bank Indonesia. Penjualan produk tidak diizinkan."
            )
        product.reference_price_per_kg = reference_price
        
        # Regenerate semantic embedding
        embedding_text = f"{new_name} {new_category}"
        try:
            product.embedding = await embedding_service.embedding_service.generate_embedding(embedding_text)
        except Exception as e:
            logger.warning(f"Failed to generate embedding on update: {e}")
            
    for key, value in update_data.items():
        setattr(product, key, value)
    
    await db.commit()
    await db.refresh(product)
    
    product_detail = await _get_product_by_id(product.id, db)
    if not product_detail:
        raise HTTPException(status_code=404, detail="Failed to retrieve updated product")
    return product_detail

@router.post("/{product_id}/refresh-reference-price", response_model=ProductResponse)
async def refresh_product_reference_price(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
        
    if product.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only refresh your own products")
        
    ref_prices = await price_matching_service.get_latest_reference_prices(db)
    matched_price = price_matching_service.find_reference_price(product.name, product.category, ref_prices)
    
    if matched_price is None:
        raise HTTPException(
            status_code=400,
            detail="Produk tidak terdaftar dalam acuan harga PIHPS Bank Indonesia. Penjualan produk tidak diizinkan."
        )
        
    product.reference_price_per_kg = matched_price
    await db.commit()
    
    product_detail = await _get_product_by_id(product.id, db)
    if not product_detail:
        raise HTTPException(status_code=404, detail="Product not found after update")
    return product_detail


