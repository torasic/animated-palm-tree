from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.services.xendit_service import xendit_service
from app.services.escrow_service import escrow_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("/xendit")
async def xendit_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Callback endpoint for Xendit invoice payment events.
    Verifies x-callback-token and triggers escrow status transitions.
    """
    # 1. Verify webhook callback token
    headers = request.headers
    if not xendit_service.verify_webhook_token(headers):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token callback Xendit tidak valid"
        )

    # 2. Parse request JSON
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload JSON tidak valid"
        )

    external_id = payload.get("external_id")
    invoice_id = payload.get("id")
    payment_status = payload.get("status")

    if not external_id or not invoice_id or not payment_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informasi callback tidak lengkap"
        )

    # 3. Handle payment events
    if payment_status.upper() == "PAID":
        await escrow_service.handle_payment_success(db, external_id, invoice_id)
    elif payment_status.upper() in ("EXPIRED", "FAILED"):
        await escrow_service.handle_payment_failure(db, external_id, invoice_id, payment_status.upper())

    return {"status": "success"}
