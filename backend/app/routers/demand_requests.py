from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, or_
from app.db import get_db
from app.models.user import User, UserRole
from app.models.demand_request import DemandRequest, DemandRequestStatus, SupplyCommitment
from app.models.rating import Rating, TransactionType
from app.schemas.demand_request import (
    DemandRequestCreate, 
    DemandCommitmentCreate, 
    DemandRequestResponse, 
    DemandRequestDetailResponse,
    SupplyCommitmentSummary,
    DemandMatchCandidate,
    DemandMatchRequest
)
from app.services import auth_service
from app.services.connection_manager import demand_manager
from app.models.payment_transaction import DemandTransaction, PaymentStatus, EscrowStatus
from app.models.product import Product, ProductStatus
from app.services.escrow_service import escrow_service
import logging
from typing import List, Optional
import uuid
from geoalchemy2 import WKTElement

router = APIRouter(prefix="/demand-requests", tags=["demand-requests"])

@router.post("", response_model=DemandRequestResponse)
async def create_demand_request(
    body: DemandRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    if current_user.role != UserRole.PEMBELI:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembeli yang dapat membuat permintaan"
        )

    deadline = body.deadline
    if deadline.tzinfo is not None:
        from datetime import timezone
        deadline = deadline.astimezone(timezone.utc).replace(tzinfo=None)

    # Generate semantic embedding from commodity_name and category
    from app.services.embedding_service import embedding_service
    embedding_text = f"{body.commodity_name} {body.category}"
    try:
        embedding_val = await embedding_service.generate_embedding(embedding_text)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to generate embedding for demand request: {e}")
        embedding_val = None

    new_request = DemandRequest(
        buyer_id=current_user.id,
        commodity_name=body.commodity_name,
        category=body.category,
        quantity_kg_needed=body.quantity_kg_needed,
        quantity_kg_committed=0.0,
        price_per_kg=body.price_per_kg,
        deadline=deadline,
        status=DemandRequestStatus.TERBUKA,
        location=WKTElement(f"POINT({body.longitude} {body.latitude})", srid=4326),
        embedding=embedding_val
    )

    db.add(new_request)
    await db.commit()
    await db.refresh(new_request)

    # Convert geography location coordinates for the response
    stmt = select(
        func.ST_Y(new_request.location).label("latitude"),
        func.ST_X(new_request.location).label("longitude")
    )
    res = await db.execute(stmt)
    row = res.first()
    lat, lng = row if row else (None, None)

    return {
        "id": new_request.id,
        "buyer_id": new_request.buyer_id,
        "commodity_name": new_request.commodity_name,
        "category": new_request.category,
        "quantity_kg_needed": new_request.quantity_kg_needed,
        "quantity_kg_committed": new_request.quantity_kg_committed,
        "price_per_kg": new_request.price_per_kg,
        "deadline": new_request.deadline,
        "status": new_request.status,
        "created_at": new_request.created_at,
        "latitude": lat,
        "longitude": lng,
        "buyer_name": current_user.full_name,
        "buyer_rating_avg": current_user.buyer_rating_avg,
        "buyer_rating_count": current_user.buyer_rating_count
    }

@router.get("", response_model=List[DemandRequestResponse])
async def list_open_demand_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    # Retrieve only TERBUKA requests sorted by shortest deadline,
    # then by lowest progress percentage (least fulfilled first)
    from sqlalchemy.orm import joinedload
    stmt = select(
        DemandRequest,
        func.ST_Y(DemandRequest.location).label("latitude"),
        func.ST_X(DemandRequest.location).label("longitude")
    ).options(
        joinedload(DemandRequest.buyer)
    ).where(
        DemandRequest.status == DemandRequestStatus.TERBUKA
    ).order_by(
        DemandRequest.deadline.asc(),
        (DemandRequest.quantity_kg_committed / DemandRequest.quantity_kg_needed).asc()
    ).offset(skip).limit(limit)

    res = await db.execute(stmt)
    records = res.all()

    items = []
    for request, lat, lng in records:
        items.append({
            "id": request.id,
            "buyer_id": request.buyer_id,
            "commodity_name": request.commodity_name,
            "category": request.category,
            "quantity_kg_needed": request.quantity_kg_needed,
            "quantity_kg_committed": request.quantity_kg_committed,
            "price_per_kg": request.price_per_kg,
            "deadline": request.deadline,
            "status": request.status,
            "created_at": request.created_at,
            "latitude": lat,
            "longitude": lng,
            "buyer_name": request.buyer.full_name if request.buyer else None,
            "buyer_rating_avg": request.buyer.buyer_rating_avg if request.buyer else None,
            "buyer_rating_count": request.buyer.buyer_rating_count if request.buyer else 0,
        })
    return items

@router.get("/mine", response_model=List[DemandRequestResponse])
async def list_my_demand_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    from sqlalchemy.orm import joinedload
    stmt = select(
        DemandRequest,
        func.ST_Y(DemandRequest.location).label("latitude"),
        func.ST_X(DemandRequest.location).label("longitude")
    ).options(
        joinedload(DemandRequest.buyer)
    ).where(
        DemandRequest.buyer_id == current_user.id
    ).order_by(
        DemandRequest.created_at.desc()
    ).offset(skip).limit(limit)

    res = await db.execute(stmt)
    records = res.all()

    items = []
    for request, lat, lng in records:
        items.append({
            "id": request.id,
            "buyer_id": request.buyer_id,
            "commodity_name": request.commodity_name,
            "category": request.category,
            "quantity_kg_needed": request.quantity_kg_needed,
            "quantity_kg_committed": request.quantity_kg_committed,
            "price_per_kg": request.price_per_kg,
            "deadline": request.deadline,
            "status": request.status,
            "created_at": request.created_at,
            "latitude": lat,
            "longitude": lng,
            "buyer_name": request.buyer.full_name if request.buyer else None,
            "buyer_rating_avg": request.buyer.buyer_rating_avg if request.buyer else None,
            "buyer_rating_count": request.buyer.buyer_rating_count if request.buyer else 0,
        })
    return items

@router.get("/committed", response_model=List[DemandRequestDetailResponse])
async def list_committed_demand_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    from sqlalchemy.orm import selectinload, joinedload
    
    if current_user.role == UserRole.PEMBELI:
        stmt = (
            select(DemandRequest)
            .options(
                joinedload(DemandRequest.buyer),
                selectinload(DemandRequest.commitments).selectinload(SupplyCommitment.petani)
            )
            .where(
                DemandRequest.buyer_id == current_user.id,
                or_(
                    DemandRequest.commitments.any(),
                    select(DemandTransaction.id).where(
                        DemandTransaction.demand_request_id == DemandRequest.id
                    ).exists()
                )
            )
            .order_by(DemandRequest.created_at.desc())
        )
    elif current_user.role == UserRole.PETANI:
        stmt = (
            select(DemandRequest)
            .options(
                joinedload(DemandRequest.buyer),
                selectinload(DemandRequest.commitments).selectinload(SupplyCommitment.petani)
            )
            .where(
                or_(
                    DemandRequest.commitments.any(SupplyCommitment.petani_id == current_user.id),
                    select(DemandTransaction.id).where(
                        DemandTransaction.demand_request_id == DemandRequest.id,
                        DemandTransaction.seller_id == current_user.id
                    ).exists()
                )
            )
            .order_by(DemandRequest.created_at.desc())
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Role tidak valid"
        )

    res = await db.execute(stmt)
    records = res.scalars().all()

    # Fetch matched transactions for all returned records to avoid N+1 queries
    record_ids = [req.id for req in records]
    dt_map = {}
    if record_ids:
        stmt_txs = select(DemandTransaction).options(joinedload(DemandTransaction.seller)).where(DemandTransaction.demand_request_id.in_(record_ids))
        res_txs = await db.execute(stmt_txs)
        for dt in res_txs.scalars().all():
            dt_map[dt.demand_request_id] = dt

    # Pre-fetch all ratings submitted by this user for DEMAND_FULFILLMENT to avoid N+1 query
    rated_demand_ids = set()
    if current_user.role == UserRole.PETANI:
        stmt_ratings = select(Rating.reference_id).where(
            Rating.transaction_type == TransactionType.DEMAND_FULFILLMENT,
            Rating.rater_id == current_user.id
        )
        res_ratings = await db.execute(stmt_ratings)
        rated_demand_ids = set(res_ratings.scalars().all())

    items = []
    for req in records:
        commits = []
        for c in req.commitments:
            commits.append({
                "id": c.id,
                "quantity_kg_committed": c.quantity_kg_committed,
                "committed_at": c.committed_at,
                "petani_name": c.petani.full_name if c.petani else None,
                "petani_phone": c.petani.phone_whatsapp if c.petani else None
            })
        
        petani_ids = {c.petani_id for c in req.commitments}
        num_petani = len(petani_ids)

        has_petani_rated = False
        if current_user.role == UserRole.PETANI:
            has_petani_rated = req.id in rated_demand_ids

        dt = dt_map.get(req.id)
        match_dict = None
        if dt:
            match_dict = {
                "id": str(dt.id),
                "seller_id": str(dt.seller_id),
                "product_id": str(dt.product_id) if dt.product_id else None,
                "seller_name": dt.seller.full_name if dt.seller else None,
                "seller_phone": dt.seller.phone_whatsapp if dt.seller else None,
                "quantity_kg": dt.quantity_kg,
                "price_per_kg": dt.price_per_kg,
                "amount": dt.amount,
                "payment_status": dt.payment_status.value if dt.payment_status else None,
                "escrow_status": dt.escrow_status.value if dt.escrow_status else None,
                "xendit_invoice_id": dt.xendit_invoice_id,
                "xendit_invoice_url": dt.xendit_invoice_url,
                "xendit_external_id": dt.xendit_external_id,
                "paid_at": dt.paid_at.isoformat() if dt.paid_at else None,
                "confirmed_received_at": dt.confirmed_received_at.isoformat() if dt.confirmed_received_at else None,
                "released_at": dt.released_at.isoformat() if dt.released_at else None
            }

        items.append({
            "id": req.id,
            "buyer_id": req.buyer_id,
            "buyer_name": req.buyer.full_name if req.buyer else None,
            "buyer_phone": req.buyer.phone_whatsapp if req.buyer else None,
            "buyer_rating_avg": req.buyer.buyer_rating_avg if req.buyer else None,
            "buyer_rating_count": req.buyer.buyer_rating_count if req.buyer else 0,
            "commodity_name": req.commodity_name,
            "category": req.category,
            "quantity_kg_needed": req.quantity_kg_needed,
            "quantity_kg_committed": req.quantity_kg_committed,
            "price_per_kg": req.price_per_kg,
            "deadline": req.deadline,
            "status": req.status,
            "created_at": req.created_at,
            "commitments": commits,
            "num_petani_committed": num_petani,
            "has_petani_rated": has_petani_rated,
            "match_transaction": match_dict
        })
    return items

PROVINCE_CENTROIDS = {
    'Aceh': (4.6951, 96.7494),
    'Bali': (-8.4095, 115.1889),
    'Banten': (-6.4058, 106.0600),
    'Bengkulu': (-3.7928, 102.2608),
    'Di Yogyakarta': (-7.8753, 110.4262),
    'Gorontalo': (0.6999, 122.4556),
    'Jambi': (-1.6116, 103.6060),
    'Jawa Barat': (-7.0909, 107.6689),
    'Jawa Tengah': (-7.1510, 110.1403),
    'Jawa Timur': (-7.5360, 112.2384),
    'Kalimantan Barat': (-0.2789, 111.4753),
    'Kalimantan Selatan': (-3.0926, 115.2838),
    'Kalimantan Tengah': (-1.6814, 113.3824),
    'Kalimantan Timur': (1.6406, 116.4194),
    'Kalimantan Utara': (3.0731, 116.0414),
    'Kepulauan Bangka Belitung': (-2.7410, 106.4406),
    'Kepulauan Riau': (3.9456, 108.1428),
    'Lampung': (-4.5586, 105.4000),
    'Maluku': (-3.2384, 130.1453),
    'Maluku Utara': (1.5700, 127.8000),
    'Nusa Tenggara Barat': (-8.6529, 117.3616),
    'Nusa Tenggara Timur': (-8.6574, 121.0794),
    'Papua': (-4.2699, 138.0804),
    'Papua Barat': (-1.3361, 132.9000),
    'Riau': (0.5071, 101.5408),
    'Sulawesi Barat': (-2.8441, 119.3324),
    'Sulawesi Selatan': (-3.6687, 119.9741),
    'Sulawesi Tengah': (-1.4300, 121.4456),
    'Sulawesi Tenggara': (-4.1449, 122.1746),
    'Sulawesi Utara': (0.6247, 123.9750),
    'Sumatera Barat': (-0.7399, 100.8000),
    'Sumatera Selatan': (-3.3194, 103.9144),
    'Sumatera Utara': (2.1153, 99.5450),
    'DKI Jakarta': (-6.2088, 106.8456)
}

def get_closest_province(lat: float, lng: float) -> str:
    closest_prov = 'Di Yogyakarta'
    min_dist = float('inf')
    for prov_name, coords in PROVINCE_CENTROIDS.items():
        dist = ((coords[0] - lat) ** 2 + (coords[1] - lng) ** 2) ** 0.5
        if dist < min_dist:
            min_dist = dist
            closest_prov = prov_name
    return closest_prov

from app.schemas.demand_request import DemandRegionalAnalyticsResponse

@router.get("/analytics/gap", response_model=DemandRegionalAnalyticsResponse)
async def get_regional_demand_gap(
    commodity_name: str = Query(..., description="Nama komoditas, misal Cabai Rawit Merah"),
    latitude: float = Query(-7.7956, description="Latitude lokasi petani"),
    longitude: float = Query(110.3695, description="Longitude lokasi petani"),
    db: AsyncSession = Depends(get_db)
):
    farmer_province = get_closest_province(latitude, longitude)

    # Filter geographically in the DB using PostGIS ST_Distance (≤300 km)
    # instead of fetching ALL demand requests and comparing in Python.
    # 300 km radius covers a typical Indonesian province span.
    gap_sql = text("""
        SELECT
            r.id, r.buyer_id, r.commodity_name, r.category,
            r.quantity_kg_needed, r.quantity_kg_committed,
            r.price_per_kg, r.deadline, r.status, r.created_at,
            ST_Y(r.location::geometry) AS latitude,
            ST_X(r.location::geometry) AS longitude,
            u.full_name AS buyer_name,
            u.buyer_rating_avg, u.buyer_rating_count
        FROM demand_requests r
        JOIN users u ON r.buyer_id = u.id
        WHERE r.status = 'TERBUKA'
          AND LOWER(r.commodity_name) LIKE :commodity_pattern
          AND r.location IS NOT NULL
          AND ST_Distance(
                r.location,
                ST_MakePoint(:lng, :lat)::geography
              ) <= 300000
        ORDER BY r.deadline ASC
    """)

    res = await db.execute(gap_sql, {
        "commodity_pattern": f"%{commodity_name.lower()}%",
        "lng": longitude,
        "lat": latitude
    })
    rows = res.fetchall()

    regional_requests = []
    total_needed = 0.0
    total_committed = 0.0

    for row in rows:
        total_needed += row.quantity_kg_needed
        total_committed += row.quantity_kg_committed

        regional_requests.append({
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
            "buyer_rating_avg": row.buyer_rating_avg or 0.0,
            "buyer_rating_count": row.buyer_rating_count or 0
        })

    ratio = (total_committed / total_needed * 100) if total_needed > 0 else 0.0

    if total_needed == 0:
        gap_status = "PELUANG_TINGGI"
    elif ratio < 50.0:
        gap_status = "PELUANG_TINGGI"
    elif ratio < 90.0:
        gap_status = "SEIMBANG"
    else:
        gap_status = "JENUH"

    return {
        "commodity_name": commodity_name,
        "province": farmer_province,
        "total_needed_kg": total_needed,
        "total_committed_kg": total_committed,
        "num_requests": len(regional_requests),
        "fulfillment_ratio": ratio,
        "status": gap_status,
        "open_requests": regional_requests
    }

@router.get("/{id}", response_model=DemandRequestDetailResponse)
async def get_demand_request_detail(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(auth_service.get_optional_current_user)
):
    from sqlalchemy.orm import joinedload
    stmt = select(
        DemandRequest,
        func.ST_Y(DemandRequest.location).label("latitude"),
        func.ST_X(DemandRequest.location).label("longitude")
    ).options(
        joinedload(DemandRequest.buyer)
    ).where(
        DemandRequest.id == id
    )

    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permintaan tidak ditemukan"
        )
    request, lat, lng = row

    # Fetch commitments
    stmt_commitments = select(SupplyCommitment).options(
        joinedload(SupplyCommitment.petani)
    ).where(
        SupplyCommitment.demand_request_id == id
    ).order_by(
        SupplyCommitment.committed_at.desc()
    )
    res_commitments = await db.execute(stmt_commitments)
    commitments = res_commitments.scalars().all()

    # Fetch distinct count of petani who committed
    stmt_count_petani = select(func.count(func.distinct(SupplyCommitment.petani_id))).where(
        SupplyCommitment.demand_request_id == id
    )
    res_count_petani = await db.execute(stmt_count_petani)
    num_petani = res_count_petani.scalar() or 0

    commits_list = [{
        "id": c.id,
        "quantity_kg_committed": c.quantity_kg_committed,
        "committed_at": c.committed_at,
        "petani_name": c.petani.full_name if c.petani else None,
        "petani_phone": c.petani.phone_whatsapp if c.petani else None,
        "petani_id": c.petani_id
    } for c in commitments]

    has_petani_rated = False
    if current_user and current_user.role == UserRole.PETANI:
        stmt_r = select(Rating).where(
            Rating.reference_id == id,
            Rating.transaction_type == TransactionType.DEMAND_FULFILLMENT,
            Rating.rater_id == current_user.id
        )
        res_r = await db.execute(stmt_r)
        has_petani_rated = res_r.scalar_one_or_none() is not None

    # Fetch ALL matched transactions (one per farmer/product selected)
    stmt_tx = select(DemandTransaction).options(joinedload(DemandTransaction.seller)).where(
        DemandTransaction.demand_request_id == id
    ).order_by(DemandTransaction.created_at.desc())
    res_tx = await db.execute(stmt_tx)
    all_dts = res_tx.scalars().all()

    def build_tx_dict(dt):
        return {
            "id": str(dt.id),
            "seller_id": str(dt.seller_id),
            "product_id": str(dt.product_id) if dt.product_id else None,
            "seller_name": dt.seller.full_name if dt.seller else None,
            "seller_phone": dt.seller.phone_whatsapp if dt.seller else None,
            "quantity_kg": dt.quantity_kg,
            "price_per_kg": dt.price_per_kg,
            "amount": dt.amount,
            "payment_status": dt.payment_status.value if dt.payment_status else None,
            "escrow_status": dt.escrow_status.value if dt.escrow_status else None,
            "xendit_invoice_id": dt.xendit_invoice_id,
            "xendit_invoice_url": dt.xendit_invoice_url,
            "xendit_external_id": dt.xendit_external_id,
            "paid_at": dt.paid_at.isoformat() if dt.paid_at else None,
            "confirmed_received_at": dt.confirmed_received_at.isoformat() if dt.confirmed_received_at else None,
            "released_at": dt.released_at.isoformat() if dt.released_at else None
        }

    match_transactions_list = [build_tx_dict(dt) for dt in all_dts]
    match_dict = match_transactions_list[0] if match_transactions_list else None

    return {
        "id": request.id,
        "buyer_id": request.buyer_id,
        "buyer_name": request.buyer.full_name if request.buyer else None,
        "buyer_phone": request.buyer.phone_whatsapp if request.buyer else None,
        "buyer_rating_avg": request.buyer.buyer_rating_avg if request.buyer else None,
        "buyer_rating_count": request.buyer.buyer_rating_count if request.buyer else 0,
        "commodity_name": request.commodity_name,
        "category": request.category,
        "quantity_kg_needed": request.quantity_kg_needed,
        "quantity_kg_committed": request.quantity_kg_committed,
        "price_per_kg": request.price_per_kg,
        "deadline": request.deadline,
        "status": request.status,
        "created_at": request.created_at,
        "latitude": lat,
        "longitude": lng,
        "commitments": commits_list,
        "num_petani_committed": num_petani,
        "has_petani_rated": has_petani_rated,
        "match_transaction": match_dict,
        "match_transactions": match_transactions_list
    }

@router.post("/{id}/commit", response_model=SupplyCommitmentSummary)
async def commit_supply_to_demand(
    id: uuid.UUID,
    body: DemandCommitmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    if current_user.role != UserRole.PETANI:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya petani/peternak yang dapat melakukan komitmen supply"
        )

    stmt = select(DemandRequest).where(DemandRequest.id == id)
    res = await db.execute(stmt)
    request = res.scalar_one_or_none()

    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permintaan tidak ditemukan"
        )
    
    if request.status != DemandRequestStatus.TERBUKA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permintaan sudah tidak terbuka untuk komitmen"
        )

    # Calculate remaining kg needed based on total commitments from the database
    stmt_sum = select(func.sum(SupplyCommitment.quantity_kg_committed)).where(
        SupplyCommitment.demand_request_id == id
    )
    res_sum = await db.execute(stmt_sum)
    total_committed = res_sum.scalar() or 0.0

    remaining_kg = max(0.0, request.quantity_kg_needed - total_committed)
    if body.quantity_kg > remaining_kg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Jumlah komitmen melebihi sisa kebutuhan ({remaining_kg} kg)"
        )

    # Create commitment
    commitment = SupplyCommitment(
        demand_request_id=id,
        petani_id=current_user.id,
        quantity_kg_committed=body.quantity_kg
    )

    db.add(commitment)

    await db.commit()
    await db.refresh(commitment)
    await db.refresh(request)

    # Fetch distinct count of petani who committed
    stmt_count_petani = select(func.count(func.distinct(SupplyCommitment.petani_id))).where(
        SupplyCommitment.demand_request_id == id
    )
    res_count_petani = await db.execute(stmt_count_petani)
    num_petani = res_count_petani.scalar() or 0

    # Broadcast updated stats to active WebSocket subscribers
    await demand_manager.broadcast(
        str(id),
        {
            "quantity_kg_committed": request.quantity_kg_committed,
            "status": request.status.value,
            "num_petani_committed": num_petani
        }
    )

    return {
        "id": commitment.id,
        "quantity_kg_committed": commitment.quantity_kg_committed,
        "committed_at": commitment.committed_at
    }


@router.get("/{id}/candidates", response_model=List[DemandMatchCandidate])
async def get_demand_matching_candidates(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Get matching product candidates for a demand request.
    """
    # Fetch demand request
    stmt = select(DemandRequest).where(DemandRequest.id == id)
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permintaan tidak ditemukan")

    if req.buyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembeli yang membuat permintaan yang dapat melihat kandidat"
        )

    if req.status != DemandRequestStatus.TERBUKA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permintaan sudah tidak terbuka untuk pencocokan"
        )

    if req.embedding is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permintaan tidak memiliki embedding. Silakan buat ulang permintaan."
        )

    match_sql = text("""
        SELECT p.id AS product_id, p.seller_id, u.full_name AS seller_name, p.name AS product_name,
               p.price_per_kg, p.quantity_kg,
               (p.embedding <=> :query_embedding) AS distance_score
        FROM products p
        JOIN users u ON p.seller_id = u.id
        WHERE p.status = 'TERSEDIA'
          AND p.quantity_kg > 0
          AND p.seller_id != :buyer_id
          AND p.embedding IS NOT NULL
          AND (p.embedding <=> :query_embedding) < 0.5
        ORDER BY distance_score ASC
        LIMIT 5
    """)

    res_match = await db.execute(match_sql, {
        "query_embedding": str(req.embedding),
        "buyer_id": str(current_user.id)
    })
    candidates = res_match.fetchall()

    return [
        {
            "product_id": row.product_id,
            "seller_id": row.seller_id,
            "seller_name": row.seller_name,
            "product_name": row.product_name,
            "price_per_kg": row.price_per_kg,
            "quantity_kg": row.quantity_kg,
            "distance_score": row.distance_score
        }
        for row in candidates
    ]


@router.post("/{id}/match")
async def match_demand_request_with_seller(
    id: uuid.UUID,
    body: DemandMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Search for a matching seller/product and create a DemandTransaction (transaksi_permintaan).
    """
    # Fetch demand request
    stmt = select(DemandRequest).where(DemandRequest.id == id)
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Permintaan tidak ditemukan")

    if req.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Hanya pembeli yang membuat permintaan yang dapat mencocokkan")

    # Check if already fully matched
    if req.quantity_kg_committed >= req.quantity_kg_needed:
        raise HTTPException(status_code=400, detail="Permintaan ini sudah terpenuhi")

    if req.embedding is None:
        raise HTTPException(
            status_code=400,
            detail="Permintaan tidak memiliki embedding. Silakan buat ulang permintaan."
        )

    # Lock the selected product row to handle race conditions
    stmt_p = select(Product).where(Product.id == body.product_id).with_for_update()
    res_p = await db.execute(stmt_p)
    product = res_p.scalar_one_or_none()

    if not product:
        raise HTTPException(
            status_code=409,
            detail="Produk tidak ditemukan atau tidak tersedia lagi. Silakan panggil kembali GET /candidates untuk daftar terbaru."
        )

    # Validate that product is a valid candidate (similarity check)
    valid_sql = text("""
        SELECT (p.embedding <=> :query_embedding) AS distance
        FROM products p
        WHERE p.id = :product_id
          AND p.status = 'TERSEDIA'
          AND p.quantity_kg > 0
          AND p.seller_id != :buyer_id
          AND p.embedding IS NOT NULL
          AND (p.embedding <=> :query_embedding) < 0.5
    """)
    res_valid = await db.execute(valid_sql, {
        "product_id": str(product.id),
        "query_embedding": str(req.embedding),
        "buyer_id": str(current_user.id)
    })
    valid_row = res_valid.fetchone()
    if not valid_row:
        raise HTTPException(
            status_code=409,
            detail="Produk tidak valid untuk permintaan ini, atau telah habis terjual. Silakan panggil kembali GET /candidates untuk daftar terbaru."
        )

    # Create DemandTransaction
    remaining_needed = max(0.0, req.quantity_kg_needed - req.quantity_kg_committed)
    default_qty = min(product.quantity_kg, remaining_needed)
    quantity_kg = default_qty
    if body.quantity_kg is not None:
        if body.quantity_kg <= 0:
            raise HTTPException(status_code=400, detail="Jumlah KG harus lebih besar dari 0")
        if body.quantity_kg > product.quantity_kg:
            raise HTTPException(status_code=400, detail="Jumlah KG tidak boleh melebihi stok produk yang tersedia")
        if body.quantity_kg > remaining_needed:
            raise HTTPException(status_code=400, detail="Jumlah KG tidak boleh melebihi sisa kebutuhan permintaan")
        quantity_kg = body.quantity_kg

    if quantity_kg <= 0:
        raise HTTPException(status_code=400, detail="Permintaan ini sudah terpenuhi atau produk tidak memiliki stok")
        
    amount = quantity_kg * product.price_per_kg
    
    # Deduct product stock
    product.quantity_kg -= quantity_kg
    if product.quantity_kg <= 0:
        product.quantity_kg = 0.0
        product.status = ProductStatus.TERJUAL
    db.add(product)

    dt = DemandTransaction(
        id=uuid.uuid4(),
        demand_request_id=id,
        seller_id=product.seller_id,
        product_id=product.id,
        quantity_kg=quantity_kg,
        price_per_kg=product.price_per_kg,
        amount=amount,
        payment_status=PaymentStatus.PENDING,
        escrow_status=EscrowStatus.NOT_STARTED,
        xendit_external_id=f"permintaan_{id.hex}_{uuid.uuid4().hex[:6]}"
    )
    db.add(dt)
    
    # Update request progress
    req.quantity_kg_committed += quantity_kg
    if req.quantity_kg_committed >= req.quantity_kg_needed:
        req.status = DemandRequestStatus.TERPENUHI
    else:
        req.status = DemandRequestStatus.TERBUKA
    db.add(req)

    await db.commit()
    await db.refresh(dt)

    # Broadcast updated stats to active WebSocket subscribers
    from datetime import datetime, timezone
    await demand_manager.broadcast(
        str(id),
        {
            "demand_request_id": str(id),
            "quantity_kg_committed": req.quantity_kg_committed,
            "status": req.status.value,
            "payment_status": dt.payment_status.value,
            "escrow_status": dt.escrow_status.value,
            "message": f"Permintaan dicocokkan dengan petani {product.seller_id.hex[:6]}.",
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()
        }
    )

    return {
        "status": "success",
        "matched": True,
        "transaction_id": str(dt.id),
        "seller_name": product.name,
        "amount": amount
    }


@router.post("/{id}/checkout")
async def checkout_demand(
    id: uuid.UUID,
    success_redirect_url: str = Query(..., description="Frontend success redirect URL"),
    failure_redirect_url: str = Query(..., description="Frontend failure redirect URL"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Creates a Xendit Invoice for checkout of a matched demand request.
    """
    # Fetch matched demand transaction (latest pending)
    stmt = select(DemandTransaction).where(
        DemandTransaction.demand_request_id == id,
        DemandTransaction.payment_status == PaymentStatus.PENDING
    ).order_by(DemandTransaction.created_at.desc())
    res = await db.execute(stmt)
    dt = res.scalars().first()
    if not dt:
        raise HTTPException(status_code=404, detail="Belum ada pencocokan transaksi untuk permintaan ini")

    # Call Escrow Service to process checkout
    invoice_url = await escrow_service.checkout_transaction(
        db=db,
        source_type="permintaan",
        source_id=dt.id,
        buyer_email=current_user.email,
        success_redirect_url=success_redirect_url,
        failure_redirect_url=failure_redirect_url
    )
    return {"invoice_url": invoice_url}


@router.post("/{id}/confirm-received")
async def confirm_demand_received(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Confirm arrival of products and release escrow funds.
    """
    # Find transaction
    stmt = select(DemandTransaction).where(
        DemandTransaction.demand_request_id == id,
        DemandTransaction.payment_status == PaymentStatus.PAID,
        DemandTransaction.escrow_status == EscrowStatus.HELD
    ).order_by(DemandTransaction.created_at.desc())
    res = await db.execute(stmt)
    dt = res.scalars().first()
    if not dt:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")

    await escrow_service.confirm_received_and_release(
        db=db,
        source_type="permintaan",
        source_id=dt.id,
        user_id=current_user.id
    )
    return {"status": "success"}


@router.post("/{id}/dispute")
async def dispute_demand(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    File an escrow dispute for the demand match.
    """
    stmt = select(DemandTransaction).where(DemandTransaction.demand_request_id == id).order_by(DemandTransaction.created_at.desc())
    res = await db.execute(stmt)
    dt = res.scalars().first()
    if not dt:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")

    await escrow_service.dispute_transaction(
        db=db,
        source_type="permintaan",
        source_id=dt.id,
        user_id=current_user.id
    )
    return {"status": "success"}


@router.post("/{id}/disburse")
async def disburse_demand_escrow(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Manually triggers/retries the Xendit disbursement payout for the farmer.
    """
    stmt = select(DemandTransaction).where(DemandTransaction.demand_request_id == id).order_by(DemandTransaction.created_at.desc())
    res = await db.execute(stmt)
    dt = res.scalars().first()
    if not dt:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")

    await escrow_service.trigger_disbursement(
        db=db,
        source_type="permintaan",
        source_id=dt.id,
        user_id=current_user.id
    )
    return {"status": "success"}


@router.post("/{id}/cancel", response_model=DemandRequestResponse)
async def cancel_demand_request(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    """
    Cancel an open demand request if no farmers have committed to it.
    """
    stmt = select(DemandRequest).where(DemandRequest.id == id)
    res = await db.execute(stmt)
    request = res.scalar_one_or_none()

    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permintaan tidak ditemukan"
        )

    if request.buyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hanya pembeli pembuat permintaan yang dapat membatalkan"
        )

    if request.status != DemandRequestStatus.TERBUKA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hanya permintaan terbuka yang dapat dibatalkan"
        )

    # Check if any commitments exist
    stmt_sum = select(func.sum(SupplyCommitment.quantity_kg_committed)).where(
        SupplyCommitment.demand_request_id == id
    )
    res_sum = await db.execute(stmt_sum)
    total_committed = res_sum.scalar() or 0.0

    if total_committed > 0 or request.quantity_kg_committed > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permintaan tidak dapat dibatalkan karena sudah ada komitmen dari petani/peternak"
        )

    request.status = DemandRequestStatus.DIBATALKAN
    db.add(request)
    await db.commit()
    await db.refresh(request)

    # Broadcast updated stats to active WebSocket subscribers
    await demand_manager.broadcast(
        str(id),
        {
            "demand_request_id": str(id),
            "quantity_kg_committed": request.quantity_kg_committed,
            "status": request.status.value,
            "num_petani_committed": 0
        }
    )

    # Convert geography location coordinates for the response
    stmt_loc = select(
        func.ST_Y(request.location).label("latitude"),
        func.ST_X(request.location).label("longitude")
    )
    res_loc = await db.execute(stmt_loc)
    row = res_loc.first()
    lat, lng = row if row else (None, None)

    return {
        "id": request.id,
        "buyer_id": request.buyer_id,
        "commodity_name": request.commodity_name,
        "category": request.category,
        "quantity_kg_needed": request.quantity_kg_needed,
        "quantity_kg_committed": request.quantity_kg_committed,
        "price_per_kg": request.price_per_kg,
        "deadline": request.deadline,
        "status": request.status,
        "created_at": request.created_at,
        "latitude": lat,
        "longitude": lng,
        "buyer_name": current_user.full_name,
        "buyer_rating_avg": current_user.buyer_rating_avg,
        "buyer_rating_count": current_user.buyer_rating_count
    }


