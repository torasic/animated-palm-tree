import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.order import Order, OrderStatus
from app.models.user import User
from app.models.payment_transaction import (
    PaymentTransaction,
    DemandTransaction,
    PaymentStatus,
    EscrowStatus
)
from app.models.demand_request import DemandRequest, DemandRequestStatus
from app.models.product import Product
from app.services.xendit_service import xendit_service
from app.services.connection_manager import manager, demand_manager

class EscrowService:
    @staticmethod
    async def checkout_transaction(
        db: AsyncSession,
        source_type: str,
        source_id: uuid.UUID,
        buyer_email: str,
        success_redirect_url: str,
        failure_redirect_url: str
    ) -> str:
        """
        Initiates escrow payment for a source (pesanan or permintaan).
        Creates Xendit invoice, logs it in payment_transactions, and updates the source record.
        """
        # 1. Fetch source details & calculate amount
        amount = 0.0
        description = ""
        external_id = f"{source_type}_{source_id.hex}_{uuid.uuid4().hex[:6]}"

        if source_type == "pesanan":
            # Fetch Order and Product
            stmt = select(Order).options(joinedload(Order.product_id)).where(Order.id == source_id)
            # Wait, order.product_id is a foreign key UUID. We need the product itself.
            # In order.py, there's product_id column but no product relationship defined.
            # Let's check order.py again. Yes, it only had product_id: Mapped[uuid.UUID] = mapped_column(...)
            # So we select Product directly.
            stmt_order = select(Order).where(Order.id == source_id)
            res_order = await db.execute(stmt_order)
            order = res_order.scalar_one_or_none()
            if not order:
                raise HTTPException(status_code=404, detail="Order tidak ditemukan")
            
            stmt_product = select(Product).where(Product.id == order.product_id)
            res_product = await db.execute(stmt_product)
            product = res_product.scalar_one_or_none()
            if not product:
                raise HTTPException(status_code=404, detail="Produk terkait order tidak ditemukan")

            amount = product.price_per_kg * order.quantity_kg
            description = f"Pembayaran Escrow Pesanan Grove - {product.name} ({order.quantity_kg} kg)"

        elif source_type == "permintaan":
            # For permintaan, source_id is the DemandTransaction ID
            stmt_dt = select(DemandTransaction).options(joinedload(DemandTransaction.demand_request)).where(DemandTransaction.id == source_id)
            res_dt = await db.execute(stmt_dt)
            dt = res_dt.scalar_one_or_none()
            if not dt:
                raise HTTPException(status_code=404, detail="Transaksi permintaan tidak ditemukan")

            amount = dt.amount
            description = f"Pembayaran Escrow Permintaan Grove - {dt.demand_request.commodity_name} ({dt.quantity_kg} kg)"
        else:
            raise HTTPException(status_code=400, detail="Tipe source tidak valid")

        # 2. Call Xendit API
        try:
            invoice_url, invoice_id = await xendit_service.create_invoice(
                external_id=external_id,
                amount=amount,
                payer_email=buyer_email,
                description=description,
                success_redirect_url=success_redirect_url,
                failure_redirect_url=failure_redirect_url
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Gagal membuat invoice Xendit: {str(e)}"
            )

        # 3. Create payment log
        payment_tx = PaymentTransaction(
            source_type=source_type,
            source_id=source_id,
            xendit_external_id=external_id,
            amount=amount
        )
        db.add(payment_tx)

        # 4. Update the source record status
        if source_type == "pesanan":
            order.xendit_invoice_id = invoice_id
            order.xendit_invoice_url = invoice_url
            order.xendit_external_id = external_id
            order.payment_status = PaymentStatus.PENDING
            db.add(order)
        else:
            dt.xendit_invoice_id = invoice_id
            dt.xendit_invoice_url = invoice_url
            dt.xendit_external_id = external_id
            dt.payment_status = PaymentStatus.PENDING
            db.add(dt)

        await db.commit()
        return invoice_url

    @staticmethod
    async def handle_payment_success(db: AsyncSession, external_id: str, xendit_invoice_id: str):
        """
        Updates payment and escrow status of a transaction upon receiving a Xendit success callback.
        """
        # 1. Find the generic payment transaction
        stmt_tx = select(PaymentTransaction).where(PaymentTransaction.xendit_external_id == external_id)
        res_tx = await db.execute(stmt_tx)
        payment_tx = res_tx.scalar_one_or_none()
        if not payment_tx:
            return  # Transaction not found in log

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # 2. Update source record based on type
        if payment_tx.source_type == "pesanan":
            stmt_order = select(Order).where(Order.id == payment_tx.source_id)
            res_order = await db.execute(stmt_order)
            order = res_order.scalar_one_or_none()
            if order:
                # Handle race condition: If order was already cancelled, auto-refund
                if order.status == OrderStatus.DIBATALKAN:
                    order.payment_status = PaymentStatus.PAID
                    order.escrow_status = EscrowStatus.REFUNDED
                    order.paid_at = now
                    db.add(order)
                    await db.commit()
                    await db.refresh(order)
                    await manager.broadcast_to_order(
                        str(order.id),
                        {
                            "order_id": str(order.id),
                            "status": order.status.value,
                            "payment_status": order.payment_status.value,
                            "escrow_status": order.escrow_status.value,
                            "message": "Pembayaran diterima setelah pesanan dibatalkan. Dana otomatis di-refund.",
                            "timestamp": now.isoformat()
                        }
                    )
                    return

                order.payment_status = PaymentStatus.PAID
                order.escrow_status = EscrowStatus.HELD
                order.paid_at = now
                # Automatically accept order if it was awaiting confirmation or checkout
                if order.status == OrderStatus.MENUNGGU_KONFIRMASI:
                    order.status = OrderStatus.DIPROSES
                db.add(order)
                await db.commit()
                await db.refresh(order)
                
                # Broadcast order update via WebSocket
                await manager.broadcast_to_order(
                    str(order.id),
                    {
                        "order_id": str(order.id),
                        "status": order.status.value,
                        "payment_status": order.payment_status.value,
                        "escrow_status": order.escrow_status.value,
                        "message": "Pembayaran escrow berhasil. Dana ditahan oleh sistem.",
                        "timestamp": now.isoformat()
                    }
                )

        elif payment_tx.source_type == "permintaan":
            stmt_dt = select(DemandTransaction).where(DemandTransaction.id == payment_tx.source_id)
            res_dt = await db.execute(stmt_dt)
            dt = res_dt.scalar_one_or_none()
            if dt:
                # Handle race condition: If demand match expired, auto-refund
                if dt.payment_status == PaymentStatus.EXPIRED:
                    dt.payment_status = PaymentStatus.PAID
                    dt.escrow_status = EscrowStatus.REFUNDED
                    dt.paid_at = now
                    db.add(dt)
                    await db.commit()
                    await db.refresh(dt)
                    await demand_manager.broadcast(
                        str(dt.demand_request_id),
                        {
                            "demand_request_id": str(dt.demand_request_id),
                            "payment_status": dt.payment_status.value,
                            "escrow_status": dt.escrow_status.value,
                            "message": "Pembayaran diterima setelah pencocokan kedaluwarsa. Dana otomatis di-refund.",
                            "timestamp": now.isoformat()
                        }
                    )
                    return

                dt.payment_status = PaymentStatus.PAID
                dt.escrow_status = EscrowStatus.HELD
                dt.paid_at = now
                db.add(dt)

                # Set demand request to TERPENUHI if it was match-completed
                stmt_req = select(DemandRequest).where(DemandRequest.id == dt.demand_request_id)
                res_req = await db.execute(stmt_req)
                req = res_req.scalar_one_or_none()
                if req:
                    req.status = DemandRequestStatus.TERPENUHI
                    db.add(req)

                await db.commit()
                await db.refresh(dt)

                # Broadcast demand request update via WebSocket
                await demand_manager.broadcast(
                    str(dt.demand_request_id),
                    {
                        "demand_request_id": str(dt.demand_request_id),
                        "status": req.status.value if req else "TERPENUHI",
                        "payment_status": dt.payment_status.value,
                        "escrow_status": dt.escrow_status.value,
                        "message": "Pembayaran escrow penawaran berhasil. Dana ditahan.",
                        "timestamp": now.isoformat()
                    }
                )

    @staticmethod
    async def confirm_received_and_release(
        db: AsyncSession,
        source_type: str,
        source_id: uuid.UUID,
        user_id: uuid.UUID
    ):
        """
        Confirm delivery of goods and release escrow funds to the seller.
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        if source_type == "pesanan":
            stmt_order = select(Order).where(Order.id == source_id)
            res_order = await db.execute(stmt_order)
            order = res_order.scalar_one_or_none()
            if not order:
                raise HTTPException(status_code=404, detail="Order tidak ditemukan")

            # Check if user is the buyer
            if order.buyer_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Hanya pembeli yang dapat mengonfirmasi penerimaan barang"
                )

            if order.escrow_status != EscrowStatus.HELD:
                raise HTTPException(
                    status_code=400,
                    detail="Escrow status tidak dalam kondisi held (dana ditahan)"
                )

            # Fetch product to find seller ID
            stmt_p = select(Product).where(Product.id == order.product_id)
            res_p = await db.execute(stmt_p)
            product = res_p.scalar_one_or_none()
            if not product:
                raise HTTPException(status_code=404, detail="Produk terkait tidak ditemukan")

            # Fetch seller to get bank details
            stmt_seller = select(User).where(User.id == product.seller_id)
            res_seller = await db.execute(stmt_seller)
            seller = res_seller.scalar_one_or_none()
            if not seller:
                raise HTTPException(status_code=404, detail="Petani/peternak penjual tidak ditemukan")

            order.escrow_status = EscrowStatus.RELEASED
            order.confirmed_received_at = now
            order.released_at = now
            order.status = OrderStatus.SELESAI
            order.buyer_confirmed_at = now
            order.received_at = now
            order.completed_at = now
            order.status_updated_at = now

            # Execute Xendit Disbursement (Cara 1)
            amount = product.price_per_kg * order.quantity_kg
            if seller.bank_name and seller.bank_account_number and seller.bank_account_holder:
                disb_external_id = f"disb_pesanan_{order.id.hex}_{uuid.uuid4().hex[:6]}"
                try:
                    res_disb = await xendit_service.create_disbursement(
                        external_id=disb_external_id,
                        amount=amount,
                        bank_code=seller.bank_name,
                        account_holder_name=seller.bank_account_holder,
                        account_number=seller.bank_account_number,
                        description=f"Grove Escrow Payout for Order {str(order.id)[:8]}"
                    )
                    order.disbursement_id = res_disb.get("id")
                    order.disbursement_status = res_disb.get("status", "PENDING").lower()
                    order.disbursed_at = now
                except Exception as e:
                    print(f"Failed to create Xendit disbursement for order {order.id}: {e}")
                    order.disbursement_status = "failed"
            else:
                order.disbursement_status = "pending_bank_details"

            db.add(order)
            await db.commit()
            await db.refresh(order)

            # Broadcast success via WebSocket
            await manager.broadcast_to_order(
                str(order.id),
                {
                    "order_id": str(order.id),
                    "status": order.status.value,
                    "payment_status": order.payment_status.value,
                    "escrow_status": order.escrow_status.value,
                    "message": "Barang dikonfirmasi diterima. Dana dicairkan ke petani/peternak.",
                    "timestamp": now.isoformat()
                }
            )

        elif source_type == "permintaan":
            # For permintaan, source_id is the DemandTransaction ID
            stmt_dt = select(DemandTransaction).options(joinedload(DemandTransaction.demand_request)).where(DemandTransaction.id == source_id)
            res_dt = await db.execute(stmt_dt)
            dt = res_dt.scalar_one_or_none()
            if not dt:
                raise HTTPException(status_code=404, detail="Transaksi permintaan tidak ditemukan")

            if dt.demand_request.buyer_id != user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Hanya pembeli yang dapat mengonfirmasi penerimaan barang"
                )

            if dt.escrow_status != EscrowStatus.HELD:
                raise HTTPException(
                    status_code=400,
                    detail="Escrow status tidak dalam kondisi held (dana ditahan)"
                )

            # Fetch seller to get bank details
            stmt_seller = select(User).where(User.id == dt.seller_id)
            res_seller = await db.execute(stmt_seller)
            seller = res_seller.scalar_one_or_none()
            if not seller:
                raise HTTPException(status_code=404, detail="Petani/peternak penjual tidak ditemukan")

            dt.escrow_status = EscrowStatus.RELEASED
            dt.confirmed_received_at = now
            dt.released_at = now

            # Execute Xendit Disbursement (Cara 1)
            if seller.bank_name and seller.bank_account_number and seller.bank_account_holder:
                disb_external_id = f"disb_permintaan_{dt.id.hex}_{uuid.uuid4().hex[:6]}"
                try:
                    res_disb = await xendit_service.create_disbursement(
                        external_id=disb_external_id,
                        amount=dt.amount,
                        bank_code=seller.bank_name,
                        account_holder_name=seller.bank_account_holder,
                        account_number=seller.bank_account_number,
                        description=f"Grove Escrow Payout for Demand {str(dt.id)[:8]}"
                    )
                    dt.disbursement_id = res_disb.get("id")
                    dt.disbursement_status = res_disb.get("status", "PENDING").lower()
                    dt.disbursed_at = now
                except Exception as e:
                    print(f"Failed to create Xendit disbursement for demand match {dt.id}: {e}")
                    dt.disbursement_status = "failed"
            else:
                dt.disbursement_status = "pending_bank_details"

            db.add(dt)
            await db.commit()
            await db.refresh(dt)

            # Broadcast success via WebSocket
            await demand_manager.broadcast(
                str(dt.demand_request_id),
                {
                    "demand_request_id": str(dt.demand_request_id),
                    "status": dt.demand_request.status.value,
                    "payment_status": dt.payment_status.value,
                    "escrow_status": dt.escrow_status.value,
                    "message": "Barang dikonfirmasi diterima. Dana dicairkan ke petani/peternak.",
                    "timestamp": now.isoformat()
                }
            )
        else:
            raise HTTPException(status_code=400, detail="Tipe source tidak valid")

    @staticmethod
    async def trigger_disbursement(
        db: AsyncSession,
        source_type: str,
        source_id: uuid.UUID,
        user_id: uuid.UUID
    ):
        """
        Manually triggers/retries a disbursement if it was previously failed or pending bank details,
        once the seller has configured their bank account.
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        if source_type == "pesanan":
            stmt_order = select(Order).where(Order.id == source_id)
            res_order = await db.execute(stmt_order)
            order = res_order.scalar_one_or_none()
            if not order:
                raise HTTPException(status_code=404, detail="Order tidak ditemukan")

            stmt_p = select(Product).where(Product.id == order.product_id)
            res_p = await db.execute(stmt_p)
            product = res_p.scalar_one_or_none()
            if not product:
                raise HTTPException(status_code=404, detail="Produk terkait tidak ditemukan")

            # Verify that the user triggering this is the seller
            if product.seller_id != user_id:
                raise HTTPException(status_code=403, detail="Hanya petani/peternak penjual yang dapat mencairkan dana")

            if order.escrow_status != EscrowStatus.RELEASED:
                raise HTTPException(status_code=400, detail="Dana belum dicairkan oleh pembeli")

            if order.disbursement_status in ("completed", "pending"):
                raise HTTPException(status_code=400, detail="Pencairan dana sedang diproses atau sudah selesai")

            stmt_seller = select(User).where(User.id == product.seller_id)
            res_seller = await db.execute(stmt_seller)
            seller = res_seller.scalar_one_or_none()
            if not seller or not (seller.bank_name and seller.bank_account_number and seller.bank_account_holder):
                raise HTTPException(status_code=400, detail="Informasi rekening bank Anda belum lengkap di profil")

            amount = product.price_per_kg * order.quantity_kg
            disb_external_id = f"disb_pesanan_{order.id.hex}_{uuid.uuid4().hex[:6]}"
            
            res_disb = await xendit_service.create_disbursement(
                external_id=disb_external_id,
                amount=amount,
                bank_code=seller.bank_name,
                account_holder_name=seller.bank_account_holder,
                account_number=seller.bank_account_number,
                description=f"Grove Escrow Payout for Order {str(order.id)[:8]}"
            )
            order.disbursement_id = res_disb.get("id")
            order.disbursement_status = res_disb.get("status", "PENDING").lower()
            order.disbursed_at = now
            db.add(order)
            await db.commit()
            await db.refresh(order)

        elif source_type == "permintaan":
            stmt_dt = select(DemandTransaction).where(DemandTransaction.id == source_id)
            res_dt = await db.execute(stmt_dt)
            dt = res_dt.scalar_one_or_none()
            if not dt:
                raise HTTPException(status_code=404, detail="Transaksi permintaan tidak ditemukan")

            if dt.seller_id != user_id:
                raise HTTPException(status_code=403, detail="Hanya petani/peternak penjual yang dapat mencairkan dana")

            if dt.escrow_status != EscrowStatus.RELEASED:
                raise HTTPException(status_code=400, detail="Dana belum dicairkan oleh pembeli")

            if dt.disbursement_status in ("completed", "pending"):
                raise HTTPException(status_code=400, detail="Pencairan dana sedang diproses atau sudah selesai")

            stmt_seller = select(User).where(User.id == dt.seller_id)
            res_seller = await db.execute(stmt_seller)
            seller = res_seller.scalar_one_or_none()
            if not seller or not (seller.bank_name and seller.bank_account_number and seller.bank_account_holder):
                raise HTTPException(status_code=400, detail="Informasi rekening bank Anda belum lengkap di profil")

            disb_external_id = f"disb_permintaan_{dt.id.hex}_{uuid.uuid4().hex[:6]}"
            
            res_disb = await xendit_service.create_disbursement(
                external_id=disb_external_id,
                amount=dt.amount,
                bank_code=seller.bank_name,
                account_holder_name=seller.bank_account_holder,
                account_number=seller.bank_account_number,
                description=f"Grove Escrow Payout for Demand {str(dt.id)[:8]}"
            )
            dt.disbursement_id = res_disb.get("id")
            dt.disbursement_status = res_disb.get("status", "PENDING").lower()
            dt.disbursed_at = now
            db.add(dt)
            await db.commit()
            await db.refresh(dt)
        else:
            raise HTTPException(status_code=400, detail="Tipe source tidak valid")

    @staticmethod
    async def dispute_transaction(
        db: AsyncSession,
        source_type: str,
        source_id: uuid.UUID,
        user_id: uuid.UUID
    ):
        """
        Puts the escrow funds under dispute due to issues/complaints.
        """
        if source_type == "pesanan":
            stmt_order = select(Order).where(Order.id == source_id)
            res_order = await db.execute(stmt_order)
            order = res_order.scalar_one_or_none()
            if not order:
                raise HTTPException(status_code=404, detail="Order tidak ditemukan")

            if order.buyer_id != user_id:
                raise HTTPException(status_code=403, detail="Hanya pembeli yang dapat mengajukan sengketa")

            order.escrow_status = EscrowStatus.DISPUTED
            db.add(order)
            await db.commit()
            await db.refresh(order)

            await manager.broadcast_to_order(
                str(order.id),
                {
                    "order_id": str(order.id),
                    "status": order.status.value,
                    "escrow_status": order.escrow_status.value,
                    "message": "Transaksi ditandai sebagai sengketa (disputed).",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )

        elif source_type == "permintaan":
            stmt_dt = select(DemandTransaction).options(joinedload(DemandTransaction.demand_request)).where(DemandTransaction.id == source_id)
            res_dt = await db.execute(stmt_dt)
            dt = res_dt.scalar_one_or_none()
            if not dt:
                raise HTTPException(status_code=404, detail="Transaksi permintaan tidak ditemukan")

            if dt.demand_request.buyer_id != user_id:
                raise HTTPException(status_code=403, detail="Hanya pembeli yang dapat mengajukan sengketa")

            dt.escrow_status = EscrowStatus.DISPUTED
            db.add(dt)
            await db.commit()
            await db.refresh(dt)

            await demand_manager.broadcast(
                str(dt.demand_request_id),
                {
                    "demand_request_id": str(dt.demand_request_id),
                    "payment_status": dt.payment_status.value,
                    "escrow_status": dt.escrow_status.value,
                    "message": "Transaksi ditandai sebagai sengketa (disputed).",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            )
        else:
            raise HTTPException(status_code=400, detail="Tipe source tidak valid")

    @staticmethod
    async def handle_payment_failure(db: AsyncSession, external_id: str, xendit_invoice_id: str, status_str: str):
        """
        Handles invoice expiration or failure callback from Xendit.
        """
        stmt_tx = select(PaymentTransaction).where(PaymentTransaction.xendit_external_id == external_id)
        res_tx = await db.execute(stmt_tx)
        payment_tx = res_tx.scalar_one_or_none()
        if not payment_tx:
            return

        new_status = PaymentStatus.EXPIRED if status_str == "EXPIRED" else PaymentStatus.FAILED
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        if payment_tx.source_type == "pesanan":
            stmt_order = select(Order).where(Order.id == payment_tx.source_id)
            res_order = await db.execute(stmt_order)
            order = res_order.scalar_one_or_none()
            if order:
                order.payment_status = new_status
                # If order is still waiting confirmation, cancel it and rollback stock
                if order.status == OrderStatus.MENUNGGU_KONFIRMASI:
                    order.status = OrderStatus.DIBATALKAN
                    from app.models.order import CancellationReason
                    order.cancellation_reason = CancellationReason.TIMEOUT_KONFIRMASI
                    order.status_updated_at = now
                    
                    # Rollback stock
                    from app.services.order_status_service import rollback_stock, broadcast_status_change
                    await rollback_stock(db, order)
                    db.add(order)
                    await db.commit()
                    await db.refresh(order)
                    await broadcast_status_change(order, f"Pesanan dibatalkan otomatis karena invoice Xendit {status_str.lower()}.")
                else:
                    db.add(order)
                    await db.commit()

        elif payment_tx.source_type == "permintaan":
            stmt_dt = select(DemandTransaction).where(DemandTransaction.id == payment_tx.source_id)
            res_dt = await db.execute(stmt_dt)
            dt = res_dt.scalar_one_or_none()
            if dt:
                # If transaction was still pending, revert product stock and demand request progress
                if dt.payment_status == PaymentStatus.PENDING:
                    from app.models.product import Product, ProductStatus
                    from app.models.demand_request import DemandRequest, DemandRequestStatus
                    
                    # 1. Revert product stock
                    if dt.product_id:
                        stmt_p = select(Product).where(Product.id == dt.product_id)
                        res_p = await db.execute(stmt_p)
                        product = res_p.scalar_one_or_none()
                        if product:
                            product.quantity_kg += dt.quantity_kg
                            if product.status == ProductStatus.TERJUAL and product.quantity_kg > 0:
                                product.status = ProductStatus.TERSEDIA
                            db.add(product)
                    
                    # 2. Revert demand committed progress
                    stmt_req = select(DemandRequest).where(DemandRequest.id == dt.demand_request_id)
                    res_req = await db.execute(stmt_req)
                    req = res_req.scalar_one_or_none()
                    if req:
                        req.quantity_kg_committed = max(0.0, req.quantity_kg_committed - dt.quantity_kg)
                        if req.status == DemandRequestStatus.TERPENUHI and req.quantity_kg_committed < req.quantity_kg_needed:
                            req.status = DemandRequestStatus.TERBUKA
                        db.add(req)

                dt.payment_status = new_status
                db.add(dt)
                await db.commit()
                await db.refresh(dt)

                # Broadcast update
                from app.routers.demand_requests import demand_manager
                await demand_manager.broadcast(
                    str(dt.demand_request_id),
                    {
                        "demand_request_id": str(dt.demand_request_id),
                        "quantity_kg_committed": req.quantity_kg_committed if 'req' in locals() and req else 0.0,
                        "status": req.status.value if 'req' in locals() and req else "TERBUKA",
                        "payment_status": dt.payment_status.value,
                        "escrow_status": dt.escrow_status.value,
                        "message": f"Transaksi pencocokan dibatalkan karena invoice Xendit {status_str.lower()}.",
                        "timestamp": now.isoformat()
                    }
                )

escrow_service = EscrowService()
