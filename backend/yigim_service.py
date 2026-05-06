"""
Yigim.az (MAGNET) Payment Gateway Service
API Version: 1.16

Payment flow:
1. Create payment via /payment/create → get redirect URL
2. User enters card info on Yigim's page
3. Yigim calls our callback URL with reference param
4. We check status via /payment/status
5. If status "00" (approved), grant user access
"""

import aiohttp
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class YigimService:
    def __init__(self, merchant: str, api_key: str, biller: str, template: str, base_url: str, sandbox: bool = True):
        self.merchant = merchant
        self.api_key = api_key
        self.biller = biller
        self.template = template
        self.base_url = base_url
        
        if sandbox:
            self.api_url = "https://sandbox.api.pay.yigim.az"
        else:
            self.api_url = "https://api.pay.yigim.az"
    
    def _headers(self) -> Dict[str, str]:
        return {
            "X-Merchant": self.merchant,
            "X-API-Key": self.api_key,
            "X-Type": "JSON"
        }
    
    async def create_payment(
        self,
        reference: str,
        amount: float,
        currency: int = 840,
        description: str = "",
        language: str = "en",
        callback_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Initialize a payment session.
        
        Args:
            reference: Unique order/payment ID
            amount: Payment amount (e.g., 49.90)
            currency: ISO 4217 numeric code (840=USD, 944=AZN)
            description: Description shown on payment page
            language: Page language (az/en/ru)
            callback_url: URL for payment status notification
            
        Returns:
            Dict with 'url' (redirect URL) on success, or error details
        """
        # Amount in coins (e.g., 49.90 → 4990)
        amount_coins = int(round(amount * 100))
        
        params = {
            "reference": reference,
            "amount": str(amount_coins),
            "currency": str(currency),
            "biller": self.biller,
            "template": self.template,
            "language": language,
            "description": description,
            "type": "SMS"
        }
        
        if callback_url:
            params["callback"] = callback_url
        
        logger.info(f"Creating Yigim payment: ref={reference}, amount={amount} ({amount_coins} coins), currency={currency}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/payment/create",
                    headers=self._headers(),
                    params=params,
                    timeout=30
                ) as response:
                    data = await response.json()
                    logger.info(f"Yigim create response: {data}")
                    
                    if data.get("code") == 0 or data.get("code") == "0":
                        return {
                            "success": True,
                            "url": data.get("url"),
                            "message": data.get("message", "OK")
                        }
                    else:
                        return {
                            "success": False,
                            "error": data.get("message", "Payment creation failed"),
                            "code": data.get("code")
                        }
        except Exception as e:
            logger.error(f"Yigim create payment error: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_payment_status(self, reference: str) -> Dict[str, Any]:
        """
        Check payment status.
        
        Args:
            reference: Payment reference ID
            
        Returns:
            Full payment status including 'status' field:
            - "00" = Approved
            - "S0" = Waiting for input
            - "S4" = Reversed/cancelled
            - Other codes = declined/error
        """
        params = {"reference": reference}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/payment/status",
                    headers=self._headers(),
                    params=params,
                    timeout=30
                ) as response:
                    data = await response.json()
                    logger.info(f"Yigim status for {reference}: status={data.get('status')}, code={data.get('code')}")
                    return data
        except Exception as e:
            logger.error(f"Yigim status check error: {e}")
            return {"error": str(e), "status": "error"}
    
    async def cancel_payment(self, reference: str, amount: Optional[int] = None) -> Dict[str, Any]:
        """Cancel/reverse a payment."""
        params = {"reference": reference}
        if amount:
            params["amount"] = str(amount)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/payment/cancel",
                    headers=self._headers(),
                    params=params,
                    timeout=30
                ) as response:
                    return await response.json()
        except Exception as e:
            logger.error(f"Yigim cancel error: {e}")
            return {"error": str(e)}
    
    async def refund_payment(self, reference: str, amount: Optional[int] = None) -> Dict[str, Any]:
        """Refund a settled payment."""
        params = {"reference": reference}
        if amount:
            params["amount"] = str(amount)
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/payment/refund",
                    headers=self._headers(),
                    params=params,
                    timeout=30
                ) as response:
                    return await response.json()
        except Exception as e:
            logger.error(f"Yigim refund error: {e}")
            return {"error": str(e)}
    
    def is_payment_approved(self, status: str) -> bool:
        """Check if payment status indicates approval."""
        return status == "00"
