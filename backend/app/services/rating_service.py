from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException, status
from app.models.rating import Rating, RoleContext, TransactionType
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.models.demand_request import DemandRequest, DemandRequestStatus, SupplyCommitment
from app.models.user import User

async def create_rating(
    db: AsyncSession,
    rater_id: UUID,
    transaction_type: TransactionType,
    reference_id: UUID,
    score: int,
    comment: str = None
) -> Rating:
    rated_id = None
    role_context = None

    if transaction_type == TransactionType.PRODUCT_PURCHASE:
        # Get order
        stmt = select(Order).where(Order.id == reference_id)
        res = await db.execute(stmt)
        order = res.scalar_one_or_none()
        if not order:
            raise HTTPException(status_code=404, detail="Order tidak ditemukan")
        
        # Verify rater is the buyer
        if order.buyer_id != rater_id:
            raise HTTPException(status_code=403, detail="Hanya pembeli yang dapat memberi rating untuk transaksi ini")
        
        # Verify order status is SELESAI
        if order.status != OrderStatus.SELESAI:
            raise HTTPException(status_code=400, detail="Transaksi belum selesai")

        # Get product to find seller
        stmt_prod = select(Product).where(Product.id == order.product_id)
        res_prod = await db.execute(stmt_prod)
        product = res_prod.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="Produk terkait tidak ditemukan")
        
        rated_id = product.seller_id
        role_context = RoleContext.AS_SELLER

    elif transaction_type == TransactionType.DEMAND_FULFILLMENT:
        # Get demand request
        stmt = select(DemandRequest).where(DemandRequest.id == reference_id)
        res = await db.execute(stmt)
        req = res.scalar_one_or_none()
        if not req:
            raise HTTPException(status_code=404, detail="Permintaan tidak ditemukan")
        
        # Verify demand request status is TERPENUHI
        if req.status != DemandRequestStatus.TERPENUHI:
            raise HTTPException(status_code=400, detail="Permintaan belum terpenuhi")
        
        # Verify rater is a farmer who has a commitment to this demand
        stmt_commit = select(SupplyCommitment).where(
            SupplyCommitment.demand_request_id == reference_id,
            SupplyCommitment.petani_id == rater_id
        )
        res_commit = await db.execute(stmt_commit)
        commitment = res_commit.scalar_one_or_none()
        if not commitment:
            raise HTTPException(status_code=403, detail="Hanya petani/peternak yang berkomitmen yang dapat menilai pembeli")
        
        rated_id = req.buyer_id
        role_context = RoleContext.AS_BUYER

    if not rated_id or not role_context:
        raise HTTPException(status_code=400, detail="Konteks transaksi tidak valid")
    
    # Check duplicate rating
    stmt_dup = select(Rating).where(
        Rating.rater_id == rater_id,
        Rating.rated_id == rated_id,
        Rating.transaction_type == transaction_type,
        Rating.reference_id == reference_id
    )
    res_dup = await db.execute(stmt_dup)
    if res_dup.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Anda sudah memberikan rating untuk transaksi ini")
    
    # Create rating
    rating = Rating(
        rater_id=rater_id,
        rated_id=rated_id,
        role_context=role_context,
        transaction_type=transaction_type,
        reference_id=reference_id,
        score=score,
        comment=comment
    )
    db.add(rating)
    await db.commit()
    await db.refresh(rating)

    # Update cache for the rated user
    await update_user_rating_cache(db, rated_id, role_context)

    return rating

async def update_user_rating_cache(db: AsyncSession, user_id: UUID, role_context: RoleContext):
    # Query all ratings for this user in this role_context
    stmt = select(func.avg(Rating.score), func.count(Rating.id)).where(
        Rating.rated_id == user_id,
        Rating.role_context == role_context
    )
    res = await db.execute(stmt)
    avg_score, count = res.first()
    
    # If no ratings, default to 0.0
    avg_score = float(avg_score) if avg_score is not None else 0.0

    # Get user
    stmt_user = select(User).where(User.id == user_id)
    res_user = await db.execute(stmt_user)
    user = res_user.scalar_one_or_none()
    if user:
        if role_context == RoleContext.AS_SELLER:
            user.seller_rating_avg = avg_score
            user.seller_rating_count = count
        else:
            user.buyer_rating_avg = avg_score
            user.buyer_rating_count = count
        
        db.add(user)
        await db.commit()

async def get_user_ratings(db: AsyncSession, user_id: UUID, role_context: RoleContext):
    # Get ratings with rater name joined
    stmt = select(Rating, User.full_name.label("rater_name")).join(
        User, Rating.rater_id == User.id
    ).where(
        Rating.rated_id == user_id,
        Rating.role_context == role_context
    ).order_by(Rating.created_at.desc())

    res = await db.execute(stmt)
    ratings_list = []
    total_score = 0
    count = 0
    for row in res:
        r = row.Rating
        ratings_list.append({
            "id": r.id,
            "rater_id": r.rater_id,
            "rated_id": r.rated_id,
            "role_context": r.role_context,
            "transaction_type": r.transaction_type,
            "reference_id": r.reference_id,
            "score": r.score,
            "comment": r.comment,
            "created_at": r.created_at,
            "rater_name": row.rater_name
        })
        total_score += r.score
        count += 1
    
    avg_score = total_score / count if count > 0 else 0.0
    return {
        "ratings": ratings_list,
        "average": round(avg_score, 1),
        "count": count
    }
