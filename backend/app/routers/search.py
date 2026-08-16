from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import List

from app.db import get_db
from app.models.product import Product, ProductStatus
from app.schemas.product import ProductResponse
from app.schemas.demand_request import DemandRequestResponse
from app.services.embedding_service import embedding_service

router = APIRouter(prefix="/search", tags=["search"])

@router.get("", response_model=List[ProductResponse])
async def semantic_search(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db)
):
    # Generate embedding for the search query
    query_embedding = await embedding_service.generate_embedding(q)
    
    # Execute semantic search using pgvector cosine distance operator (<=>)
    # We use raw SQL because pgvector-sqlalchemy integration with async sessions 
    # can be tricky depending on the version, and raw SQL is explicit.
    
    sql = text("""
        SELECT p.id, p.seller_id, p.name, p.category, p.quantity_kg, p.price_per_kg, p.reference_price_per_kg, p.status, p.photo_url, p.created_at,
               ST_Y(p.location::geometry) as latitude, ST_X(p.location::geometry) as longitude,
               u.full_name as seller_name, u.seller_rating_avg, u.seller_rating_count
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.status = 'TERSEDIA'
        ORDER BY p.embedding <=> :embedding
        LIMIT 20
    """)
    
    result = await db.execute(sql, {"embedding": str(query_embedding)})
    
    # Map the results to the schema
    products = []
    for row in result:
        products.append({
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
            "latitude": row.latitude,
            "longitude": row.longitude,
            "seller_name": row.seller_name,
            "seller_rating_avg": row.seller_rating_avg,
            "seller_rating_count": row.seller_rating_count
        })
        
    return products

@router.get("/demands", response_model=List[DemandRequestResponse])
async def semantic_search_demands(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db)
):
    # Generate embedding for the search query
    query_embedding = await embedding_service.generate_embedding(q)
    
    # Execute semantic search on demand requests using <=> pgvector operator
    sql = text("""
        SELECT r.id, r.buyer_id, r.commodity_name, r.category, r.quantity_kg_needed, r.quantity_kg_committed, r.price_per_kg, r.deadline, r.status, r.created_at,
               ST_Y(r.location::geometry) as latitude, ST_X(r.location::geometry) as longitude,
               u.full_name as buyer_name, u.buyer_rating_avg, u.buyer_rating_count
        FROM demand_requests r
        JOIN users u ON r.buyer_id = u.id
        WHERE r.status = 'TERBUKA' AND (r.embedding <=> :embedding) < 0.45
        ORDER BY r.embedding <=> :embedding
        LIMIT 50
    """)
    
    result = await db.execute(sql, {"embedding": str(query_embedding)})
    
    demands = []
    for row in result:
        demands.append({
            "id": row.id,
            "buyer_id": row.buyer_id,
            "commodity_name": row.commodity_name,
            "category": row.category,
            "quantity_kg_needed": row.quantity_kg_needed,
            "quantity_kg_committed": row.quantity_kg_committed,
            "price_per_kg": row.price_per_kg,
            "deadline": row.deadline,
            "status": row.status,
            "created_at": row.created_at,
            "latitude": row.latitude,
            "longitude": row.longitude,
            "buyer_name": row.buyer_name,
            "buyer_rating_avg": row.buyer_rating_avg,
            "buyer_rating_count": row.buyer_rating_count
        })
        
    return demands
