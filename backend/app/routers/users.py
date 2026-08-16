from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import WKTElement
from sqlalchemy import select
from uuid import UUID

from app.db import get_db
from app.schemas.user import UserResponse, UserLocationUpdate, UpgradeToFarmerRequest, UpdateProfileRequest
from app.models.user import User, UserRole
from app.services import auth_service, storage_service
from app.services.auth_service import validate_indonesian_phone

router = APIRouter(prefix="/users", tags=["users"])

@router.patch("/me/location", response_model=UserResponse)
async def update_location(
    location_data: UserLocationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    current_user.location = WKTElement(f"POINT({location_data.lng} {location_data.lat})", srid=4326)
    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.post("/upgrade-to-farmer", response_model=UserResponse)
async def upgrade_to_farmer(
    upgrade_data: UpgradeToFarmerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    if not upgrade_data.bio.strip():
        raise HTTPException(status_code=400, detail="Deskripsi/Bio tidak boleh kosong")
    current_user.bio = upgrade_data.bio.strip()

    if not upgrade_data.bank_name.strip():
        raise HTTPException(status_code=400, detail="Nama bank tidak boleh kosong")
    current_user.bank_name = upgrade_data.bank_name.strip()

    if not upgrade_data.bank_account_number.strip():
        raise HTTPException(status_code=400, detail="Nomor rekening tidak boleh kosong")
    current_user.bank_account_number = upgrade_data.bank_account_number.strip()

    if not upgrade_data.bank_account_holder.strip():
        raise HTTPException(status_code=400, detail="Nama pemilik rekening tidak boleh kosong")
    current_user.bank_account_holder = upgrade_data.bank_account_holder.strip()
    
    current_user.role = UserRole.PETANI
    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.patch("/me", response_model=UserResponse)
async def update_profile(
    profile_data: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    if profile_data.role is not None:
        current_user.role = profile_data.role

    phone = profile_data.phone_whatsapp or profile_data.phone_number
    if phone is not None:
        if phone == "":
            current_user.phone_whatsapp = None
        else:
            if not validate_indonesian_phone(phone):
                raise HTTPException(
                    status_code=400,
                    detail="Format nomor telepon tidak valid. Gunakan format Indonesia (misal: 08xx atau +628xx)"
                )
            current_user.phone_whatsapp = phone

    if profile_data.bio is not None:
        current_user.bio = profile_data.bio

    if profile_data.theme_color is not None:
        current_user.theme_color = profile_data.theme_color

    if profile_data.full_name is not None:
        if not profile_data.full_name.strip():
            raise HTTPException(status_code=400, detail="Nama lengkap tidak boleh kosong")
        current_user.full_name = profile_data.full_name.strip()

    if profile_data.avatar_url is not None:
        current_user.avatar_url = profile_data.avatar_url.strip() or None

    if profile_data.bank_name is not None:
        current_user.bank_name = profile_data.bank_name.strip() or None

    if profile_data.bank_account_number is not None:
        current_user.bank_account_number = profile_data.bank_account_number.strip() or None

    if profile_data.bank_account_holder is not None:
        current_user.bank_account_holder = profile_data.bank_account_holder.strip() or None

    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return user

@router.get("", response_model=list[UserResponse])
async def list_users(
    role: UserRole = None,
    q: str = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        stmt = stmt.where(User.full_name.ilike(f"%{q}%"))
    res = await db.execute(stmt)
    users = res.scalars().all()
    return users

@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    avatar: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    try:
        avatar_url = await storage_service.upload_product_photo(avatar)
        current_user.avatar_url = avatar_url
        await db.commit()
        await db.refresh(current_user)
        return current_user
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengunggah foto profil: {str(e)}")


