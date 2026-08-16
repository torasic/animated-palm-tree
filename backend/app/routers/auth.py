from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
from google.oauth2 import id_token
from google.auth.transport import requests

from app.db import get_db
from app.schemas.auth import GoogleLoginRequest
from app.schemas.user import UserResponse, CompleteProfileRequest
from app.models.user import User, UserRole
from app.models.token import RefreshToken
from app.services import auth_service
from app.config import settings
from geoalchemy2 import WKTElement

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/google")
async def login_google(response: Response, login_data: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    if settings.APP_ENV == "development" and login_data.id_token in ["mock_token_existing", "mock_token_new"]:
        email = "mock_user@example.com" if login_data.id_token == "mock_token_existing" else "new_mock_user@example.com"
        name = "Mock User" if login_data.id_token == "mock_token_existing" else "New Mock User"
        sub = "mock_google_sub_12345" if login_data.id_token == "mock_token_existing" else "new_mock_google_sub_67890"
        picture = None
    else:
        try:
            # Verify the ID token from Google in a thread pool to avoid blocking the event loop
            import asyncio
            id_info = await asyncio.to_thread(
                id_token.verify_oauth2_token,
                login_data.id_token,
                requests.Request(),
                settings.GOOGLE_CLIENT_ID,
                clock_skew_in_seconds=10
            )
            
            email = id_info.get("email")
            name = id_info.get("name")
            sub = id_info.get("sub") # Google unique ID
            picture = id_info.get("picture")
            
            if not email or not sub:
                raise HTTPException(status_code=400, detail="Invalid token details from Google")
                
        except ValueError as e:
            raise HTTPException(status_code=401, detail=f"Invalid Google ID Token: {str(e)}")
        
    # Check if user already exists
    result = await db.execute(select(User).where(User.google_sub == sub))
    user = result.scalar_one_or_none()
    
    if login_data.id_token == "mock_token_new" and user:
        # Reset mock user role to force onboarding
        user.role = None
        user.phone_whatsapp = None
        await db.commit()
        await db.refresh(user)
    
    if not user:
        # Create new user, role is nullable (filled during onboarding)
        user = User(
            email=email,
            google_sub=sub,
            full_name=name or "Google User",
            avatar_url=picture,
            role="PEMBELI" if login_data.id_token == "mock_token_existing" else None,
            phone_whatsapp="08123456789" if login_data.id_token == "mock_token_existing" else None
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    # Generate tokens
    access_token = auth_service.create_access_token(data={"sub": str(user.id)})
    refresh_token_raw = auth_service.generate_refresh_token()
    
    # Save refresh token in DB
    new_refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=auth_service.hash_password(refresh_token_raw),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    db.add(new_refresh_token)
    await db.commit()
    
    # Set cookies
    cookie_secure = settings.APP_ENV == "production"
    cookie_samesite = "none" if settings.APP_ENV == "production" else "lax"

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite=cookie_samesite,
        secure=cookie_secure,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_raw,
        httponly=True,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        samesite=cookie_samesite,
        secure=cookie_secure,
    )
    
    need_onboarding = user.role is None
    
    return {
        "message": "Login successful",
        "need_onboarding": need_onboarding,
        "user": UserResponse.model_validate(user)
    }

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(auth_service.get_current_user)):
    return current_user

@router.get("/supabase-token")
async def get_supabase_token(current_user: User = Depends(auth_service.get_current_user)):
    payload = {
        "sub": str(current_user.id),
        "role": "authenticated",
        "aud": "authenticated",
        "iss": "supabase"
    }
    token = auth_service.create_access_token(data=payload)
    return {"token": token}


@router.post("/complete-profile", response_model=UserResponse)
async def complete_profile(
    profile_data: CompleteProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(auth_service.get_current_user)
):
    phone = profile_data.phone_whatsapp
    if phone:
        if not auth_service.validate_indonesian_phone(phone):
            raise HTTPException(
                status_code=400,
                detail="Format nomor telepon tidak valid. Gunakan format Indonesia (misal: 08xx atau +628xx)"
            )
        current_user.phone_whatsapp = phone

    current_user.role = profile_data.role or UserRole.PEMBELI
    if profile_data.lat is not None and profile_data.lng is not None:
        current_user.location = WKTElement(f"POINT({profile_data.lng} {profile_data.lat})", srid=4326)
    await db.commit()
    await db.refresh(current_user)
    return current_user

@router.post("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh_token_raw = request.cookies.get("refresh_token")
    if not refresh_token_raw:
        raise HTTPException(status_code=401, detail="No refresh token")
        
    hashed_token = auth_service.hash_password(refresh_token_raw)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == hashed_token,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > datetime.now(timezone.utc).replace(tzinfo=None)
        )
    )
    found_token = result.scalar_one_or_none()
                
    if not found_token:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
        
    access_token = auth_service.create_access_token(data={"sub": str(found_token.user_id)})
    
    cookie_secure = settings.APP_ENV == "production"
    cookie_samesite = "none" if settings.APP_ENV == "production" else "lax"

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite=cookie_samesite,
        secure=cookie_secure,
    )
    
    return {"message": "Token refreshed"}

@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh_token_raw = request.cookies.get("refresh_token")
    if refresh_token_raw:
        hashed_token = auth_service.hash_password(refresh_token_raw)
        result = await db.execute(
            select(RefreshToken).where(
                RefreshToken.token_hash == hashed_token,
                RefreshToken.revoked == False
            )
        )
        found_token = result.scalar_one_or_none()
        if found_token:
            found_token.revoked = True
            await db.commit()
                
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"message": "Logged out"}
