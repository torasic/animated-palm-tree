from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db import get_db
from app.models.scraper_status import ScraperStatus
from app.config import settings
from typing import Optional

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/scraper-status")
async def get_admin_scraper_status(
    token: Optional[str] = Query(None, description="Admin verification token"),
    db: AsyncSession = Depends(get_db)
):
    if not token or token != settings.ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized admin token"
        )
    result = await db.execute(
        select(ScraperStatus).order_by(ScraperStatus.last_run_at.desc()).limit(1)
    )
    latest_run = result.scalar_one_or_none()
    
    if not latest_run:
        return {
            "last_run": None,
            "status": "idle",
            "last_error": None,
            "items_scraped": 0
        }
        
    return {
        "last_run": latest_run.last_run_at.isoformat(),
        "status": latest_run.status.value,
        "last_error": latest_run.error_message,
        "items_scraped": latest_run.items_scraped
    }
