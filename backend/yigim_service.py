"""
Yigim.az (MAGNET) Payment Gateway Service

Authentication is by HMAC-style request signing:
- X-Merchant header: merchant name
- X-Type: "JSON"
- X-Signature: base64(md5(concat(all-params + secret)))   # per-request, NOT a static key

Payment flow:
1. Create payment via /payment/create -> returns redirect URL
2. User enters card info on Yigim's hosted page
3. Yigim redirects user back to our callback URL with ?reference=<ref>
4. We verify status via /payment/status
5. If status == "00" (approved), we grant user access

Reference: https://github.com/paladium/yigim-gateway-go (official-style SDK)
"""

import hashlib
import base64
import logging
from typing import Optional, Dict, Any

import aiohttp

logger = logging.getLogger(__name__)


def _signature(value: str) -> str:
    """base64(md5(value))"""
    md5_bytes = hashlib.md5(value.encode("utf-8")).digest()
    return base64.b64encode(md5_bytes).decode("utf-8")


class YigimService:
    def __init__(
        self,
        merchant: str,
        api_key: str,
        biller: str,
        template: str,
        base_url: str = "",
        sandbox: bool = True,
    ):
        # `api_key` here is the Yigim Secret used to compute X-Signature
        self.merchant = merchant
        self.secret = api_key
        self.biller = biller
        self.template = template
        self.base_url = base_url
        self.api_url = (
            "https://sandbox.api.pay.yigim.az" if sandbox
            else "https://api.pay.yigim.az"
        )

    def _base_headers(self, signature: str) -> Dict[str, str]:
        return {
            "X-Merchant": self.merchant,
            "X-Type": "JSON",
            "X-Signature": signature,
        }

    async def create_payment(
        self,
        reference: str,
        amount: float,
        currency: int = 944,
        description: str = "",
        language: str = "en",
        callback_url: Optional[str] = None,
        token: str = "",
        save: str = "n",
        ptype: str = "SMS",
        extra: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Initialize a payment session.

        Returns dict with 'success', 'url' (redirect URL), 'message'.
        """
        amount_coins = int(round(amount * 100))
        currency_str = str(currency)
        callback = callback_url or ""

        # Encode extra as "k1=v1;k2=v2;"
        extra_str = ""
        if extra:
            for k, v in extra.items():
                extra_str += f"{k}={v};"

        # Build the canonical signature string in the EXACT field order
        # used by Yigim:
        # reference|type|token|save|amount|currency|biller|description|
        # template|language|callback|extra|secret
        sig_input = (
            reference
            + ptype
            + token
            + save
            + str(amount_coins)
            + currency_str
            + self.biller
            + description
            + self.template
            + language
            + callback
            + extra_str
            + self.secret
        )
        signature = _signature(sig_input)

        params = {
            "reference": reference,
            "type": ptype,
            "token": token,
            "save": save,
            "amount": str(amount_coins),
            "currency": currency_str,
            "biller": self.biller,
            "description": description,
            "template": self.template,
            "language": language,
            "callback": callback,
            "extra": extra_str,
        }

        logger.info(
            f"Yigim create_payment: ref={reference}, amount={amount} "
            f"({amount_coins} coins), currency={currency_str}, biller={self.biller}"
        )

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/payment/create",
                    headers=self._base_headers(signature),
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    text = await response.text()
                    try:
                        data = await response.json(content_type=None)
                    except Exception:
                        logger.error(f"Yigim non-JSON response: {text[:500]}")
                        return {
                            "success": False,
                            "error": f"Invalid response from Yigim: {text[:200]}",
                        }

                    logger.info(f"Yigim create response: {data}")

                    code = data.get("code")
                    if code in (0, "0"):
                        return {
                            "success": True,
                            "url": data.get("url"),
                            "message": data.get("message", "OK"),
                        }
                    return {
                        "success": False,
                        "error": data.get("message", "Payment creation failed"),
                        "code": code,
                    }
        except Exception as e:
            logger.error(f"Yigim create_payment error: {e}")
            return {"success": False, "error": str(e)}

    async def get_payment_status(self, reference: str) -> Dict[str, Any]:
        """Check payment status. Signed string = reference + secret."""
        signature = _signature(reference + self.secret)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/payment/status",
                    headers=self._base_headers(signature),
                    params={"reference": reference},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    text = await response.text()
                    try:
                        data = await response.json(content_type=None)
                    except Exception:
                        logger.error(f"Yigim status non-JSON response: {text[:500]}")
                        return {"error": text[:200], "status": "error"}
                    logger.info(
                        f"Yigim status for {reference}: status={data.get('status')}, "
                        f"code={data.get('code')}"
                    )
                    return data
        except Exception as e:
            logger.error(f"Yigim status check error: {e}")
            return {"error": str(e), "status": "error"}

    async def refund_payment(
        self, reference: str, amount: Optional[int] = None
    ) -> Dict[str, Any]:
        """Refund a settled payment. Signed string = reference + secret."""
        signature = _signature(reference + self.secret)
        params: Dict[str, str] = {"reference": reference}
        if amount:
            params["amount"] = str(amount)
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.api_url}/payment/refund",
                    headers=self._base_headers(signature),
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as response:
                    return await response.json(content_type=None)
        except Exception as e:
            logger.error(f"Yigim refund error: {e}")
            return {"error": str(e)}

    def is_payment_approved(self, status: Optional[str]) -> bool:
        """Yigim status code '00' = Approved."""
        return status == "00"
