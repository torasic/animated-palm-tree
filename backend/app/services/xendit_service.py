import base64
import httpx
from typing import Tuple, Dict, Any, Optional, Mapping
from app.config import settings

class XenditService:
    @staticmethod
    def _get_auth_header() -> Dict[str, str]:
        # Xendit Basic auth uses the API key as the username and an empty password.
        api_key = settings.XENDIT_SECRET_KEY
        auth_bytes = f"{api_key}:".encode("ascii")
        auth_b64 = base64.b64encode(auth_bytes).decode("ascii")
        return {
            "Authorization": f"Basic {auth_b64}",
            "Content-Type": "application/json"
        }

    @classmethod
    async def create_invoice(
        cls,
        external_id: str,
        amount: float,
        payer_email: str,
        description: str,
        success_redirect_url: str,
        failure_redirect_url: str
    ) -> Tuple[str, str]:
        """
        Creates a Xendit invoice for sandbox payments.
        Returns:
            Tuple of (invoice_url, invoice_id)
        """
        url = "https://api.xendit.co/v2/invoices"
        payload = {
            "external_id": external_id,
            "amount": int(amount),  # Xendit expects integer amount
            "payer_email": payer_email,
            "description": description,
            "success_redirect_url": success_redirect_url,
            "failure_redirect_url": failure_redirect_url
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=cls._get_auth_header(),
                timeout=10.0
            )
            
            if response.status_code != 200:
                raise Exception(
                    f"Xendit error {response.status_code}: {response.text}"
                )
                
            data = response.json()
            return data["invoice_url"], data["id"]

    @staticmethod
    def verify_webhook_token(headers: Mapping[str, str]) -> bool:
        """
        Validates the callback token sent in the headers from Xendit.
        """
        token = headers.get("x-callback-token")
        if not token:
            return False
        return token == settings.XENDIT_WEBHOOK_TOKEN

    @classmethod
    async def get_invoice_status(cls, invoice_id: str) -> str:
        """
        Fetches the current status of a Xendit invoice (e.g. PAID, PENDING, EXPIRED).
        """
        url = f"https://api.xendit.co/v2/invoices/{invoice_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers=cls._get_auth_header(),
                timeout=10.0
            )
            if response.status_code != 200:
                raise Exception(
                    f"Xendit error fetching invoice status {response.status_code}: {response.text}"
                )
            data = response.json()
            return data.get("status", "PENDING")

    @classmethod
    async def create_disbursement(
        cls,
        external_id: str,
        amount: float,
        bank_code: str,
        account_holder_name: str,
        account_number: str,
        description: str
    ) -> Dict[str, Any]:
        """
        Creates a disbursement (pencairan dana) to a seller's bank account.
        """
        url = "https://api.xendit.co/disbursements"
        payload = {
            "external_id": external_id,
            "amount": int(amount),
            "bank_code": bank_code.upper(),
            "account_holder_name": account_holder_name,
            "account_number": account_number,
            "description": description
        }

        headers = cls._get_auth_header()
        headers["X-Idempotency-Key"] = external_id

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=payload,
                headers=headers,
                timeout=10.0
            )

            if response.status_code not in (200, 201):
                raise Exception(
                    f"Xendit disbursement error {response.status_code}: {response.text}"
                )

            return response.json()


xendit_service = XenditService()
