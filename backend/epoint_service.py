"""
Epoint.az Payment Gateway Service
API Version: 1.0.3

This module handles all Epoint payment operations including:
- Payment request creation
- Signature generation and validation
- Callback handling
- Payment status checks
"""

import base64
import hashlib
import json
import httpx
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Epoint API Endpoints
EPOINT_API_BASE = "https://epoint.az/api/1"
EPOINT_REQUEST_URL = f"{EPOINT_API_BASE}/request"
EPOINT_STATUS_URL = f"{EPOINT_API_BASE}/get-status"
EPOINT_REFUND_URL = f"{EPOINT_API_BASE}/refund-request"
EPOINT_CARD_REGISTER_URL = f"{EPOINT_API_BASE}/card-registration"
EPOINT_EXECUTE_PAY_URL = f"{EPOINT_API_BASE}/execute-pay"
EPOINT_PREAUTH_URL = f"{EPOINT_API_BASE}/pre-auth"
EPOINT_PREAUTH_COMPLETE_URL = f"{EPOINT_API_BASE}/pre-auth-complete"


@dataclass
class EpointConfig:
    """Epoint configuration"""
    public_key: str
    private_key: str
    success_url: str
    error_url: str
    result_url: str
    currency: str = "AZN"
    language: str = "az"


class EpointService:
    """
    Epoint Payment Gateway Service
    
    Handles all payment operations with secure signature generation.
    """
    
    def __init__(self, config: EpointConfig):
        self.config = config
        self.public_key = config.public_key
        self.private_key = config.private_key
    
    def _generate_signature(self, data: str) -> str:
        """
        Generate signature for Epoint API
        
        Formula: base64_encode(sha1(private_key + data + private_key, true))
        
        Args:
            data: Base64 encoded JSON data
            
        Returns:
            Base64 encoded SHA1 signature
        """
        signature_string = f"{self.private_key}{data}{self.private_key}"
        sha1_hash = hashlib.sha1(signature_string.encode('utf-8')).digest()
        signature = base64.b64encode(sha1_hash).decode('utf-8')
        return signature
    
    def _encode_data(self, payload: Dict[str, Any]) -> str:
        """
        Encode payload to base64 JSON string
        
        Args:
            payload: Dictionary to encode
            
        Returns:
            Base64 encoded JSON string
        """
        json_string = json.dumps(payload, separators=(',', ':'))
        return base64.b64encode(json_string.encode('utf-8')).decode('utf-8')
    
    def _decode_data(self, encoded_data: str) -> Dict[str, Any]:
        """
        Decode base64 JSON string to dictionary
        
        Args:
            encoded_data: Base64 encoded string
            
        Returns:
            Decoded dictionary
        """
        try:
            decoded_bytes = base64.b64decode(encoded_data)
            return json.loads(decoded_bytes.decode('utf-8'))
        except Exception as e:
            logger.error(f"Failed to decode Epoint data: {e}")
            raise ValueError(f"Invalid encoded data: {e}")
    
    def verify_signature(self, data: str, signature: str) -> bool:
        """
        Verify callback signature from Epoint
        
        Args:
            data: Base64 encoded data from callback
            signature: Signature from callback
            
        Returns:
            True if signature is valid
        """
        expected_signature = self._generate_signature(data)
        is_valid = expected_signature == signature
        
        if not is_valid:
            logger.warning(f"Signature mismatch. Expected: {expected_signature[:20]}..., Got: {signature[:20]}...")
        
        return is_valid
    
    async def create_payment_request(
        self,
        order_id: str,
        amount: float,
        description: str,
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new payment request
        
        Args:
            order_id: Unique order identifier
            amount: Payment amount in AZN
            description: Payment description
            language: Payment page language (az, en, ru)
            
        Returns:
            Dict with redirect_url on success or error details
        """
        payload = {
            "public_key": self.public_key,
            "amount": round(amount, 2),
            "currency": self.config.currency,
            "language": language or self.config.language,
            "order_id": order_id,
            "description": description,
            "success_redirect_url": self.config.success_url,
            "error_redirect_url": self.config.error_url
        }
        
        data = self._encode_data(payload)
        signature = self._generate_signature(data)
        
        logger.info(f"Creating Epoint payment request for order: {order_id}, amount: {amount} AZN")
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    EPOINT_REQUEST_URL,
                    data={
                        "data": data,
                        "signature": signature
                    }
                )
                
                result = response.json()
                logger.info(f"Epoint payment request response: {result}")
                
                if result.get("status") == "success":
                    return {
                        "success": True,
                        "redirect_url": result.get("redirect_url"),
                        "transaction_id": result.get("transaction")
                    }
                else:
                    return {
                        "success": False,
                        "error": result.get("message", "Payment request failed"),
                        "code": result.get("code")
                    }
                    
        except Exception as e:
            logger.error(f"Epoint payment request failed: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def get_payment_status(self, order_id: str) -> Dict[str, Any]:
        """
        Check payment status for an order
        
        Args:
            order_id: Order identifier
            
        Returns:
            Payment status details
        """
        payload = {
            "public_key": self.public_key,
            "order_id": order_id
        }
        
        data = self._encode_data(payload)
        signature = self._generate_signature(data)
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    EPOINT_STATUS_URL,
                    data={
                        "data": data,
                        "signature": signature
                    }
                )
                
                result = response.json()
                logger.info(f"Epoint status check for order {order_id}: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Epoint status check failed: {e}")
            return {"status": "error", "message": str(e)}
    
    async def request_refund(
        self,
        order_id: str,
        transaction_id: str,
        amount: Optional[float] = None,
        currency: str = "AZN"
    ) -> Dict[str, Any]:
        """
        Request a refund for a transaction
        
        Args:
            order_id: Original order ID
            transaction_id: Original transaction ID
            amount: Refund amount (optional, full refund if not specified)
            currency: Currency code
            
        Returns:
            Refund result
        """
        payload = {
            "public_key": self.public_key,
            "order_id": order_id,
            "transaction": transaction_id,
            "currency": currency
        }
        
        if amount is not None:
            payload["amount"] = round(amount, 2)
        
        data = self._encode_data(payload)
        signature = self._generate_signature(data)
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    EPOINT_REFUND_URL,
                    data={
                        "data": data,
                        "signature": signature
                    }
                )
                
                result = response.json()
                logger.info(f"Epoint refund request for order {order_id}: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Epoint refund request failed: {e}")
            return {"status": "error", "message": str(e)}
    
    async def register_card(
        self,
        order_id: str,
        description: str = "Card Registration"
    ) -> Dict[str, Any]:
        """
        Register a card for future payments
        
        Args:
            order_id: Unique registration order ID
            description: Registration description
            
        Returns:
            Card registration result with redirect URL
        """
        payload = {
            "public_key": self.public_key,
            "order_id": order_id,
            "description": description,
            "success_redirect_url": self.config.success_url,
            "error_redirect_url": self.config.error_url
        }
        
        data = self._encode_data(payload)
        signature = self._generate_signature(data)
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    EPOINT_CARD_REGISTER_URL,
                    data={
                        "data": data,
                        "signature": signature
                    }
                )
                
                result = response.json()
                logger.info(f"Epoint card registration for order {order_id}: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Epoint card registration failed: {e}")
            return {"status": "error", "message": str(e)}
    
    async def execute_saved_card_payment(
        self,
        order_id: str,
        amount: float,
        card_id: str,
        description: str
    ) -> Dict[str, Any]:
        """
        Execute payment with saved card
        
        Args:
            order_id: Unique order ID
            amount: Payment amount
            card_id: Saved card identifier
            description: Payment description
            
        Returns:
            Payment result
        """
        payload = {
            "public_key": self.public_key,
            "order_id": order_id,
            "amount": round(amount, 2),
            "currency": self.config.currency,
            "card_id": card_id,
            "description": description
        }
        
        data = self._encode_data(payload)
        signature = self._generate_signature(data)
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    EPOINT_EXECUTE_PAY_URL,
                    data={
                        "data": data,
                        "signature": signature
                    }
                )
                
                result = response.json()
                logger.info(f"Epoint saved card payment for order {order_id}: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Epoint saved card payment failed: {e}")
            return {"status": "error", "message": str(e)}
    
    async def create_preauth(
        self,
        order_id: str,
        amount: float,
        description: str
    ) -> Dict[str, Any]:
        """
        Create a pre-authorization hold
        
        Args:
            order_id: Unique order ID
            amount: Hold amount
            description: Description
            
        Returns:
            Pre-auth result with redirect URL
        """
        payload = {
            "public_key": self.public_key,
            "order_id": order_id,
            "amount": round(amount, 2),
            "currency": self.config.currency,
            "description": description,
            "success_redirect_url": self.config.success_url,
            "error_redirect_url": self.config.error_url
        }
        
        data = self._encode_data(payload)
        signature = self._generate_signature(data)
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    EPOINT_PREAUTH_URL,
                    data={
                        "data": data,
                        "signature": signature
                    }
                )
                
                result = response.json()
                logger.info(f"Epoint pre-auth for order {order_id}: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Epoint pre-auth failed: {e}")
            return {"status": "error", "message": str(e)}
    
    async def complete_preauth(
        self,
        order_id: str,
        transaction_id: str,
        amount: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Complete a pre-authorization (capture funds)
        
        Args:
            order_id: Original pre-auth order ID
            transaction_id: Pre-auth transaction ID
            amount: Capture amount (optional, full amount if not specified)
            
        Returns:
            Capture result
        """
        payload = {
            "public_key": self.public_key,
            "order_id": order_id,
            "transaction": transaction_id
        }
        
        if amount is not None:
            payload["amount"] = round(amount, 2)
        
        data = self._encode_data(payload)
        signature = self._generate_signature(data)
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    EPOINT_PREAUTH_COMPLETE_URL,
                    data={
                        "data": data,
                        "signature": signature
                    }
                )
                
                result = response.json()
                logger.info(f"Epoint pre-auth complete for order {order_id}: {result}")
                return result
                
        except Exception as e:
            logger.error(f"Epoint pre-auth complete failed: {e}")
            return {"status": "error", "message": str(e)}
    
    def parse_callback(self, data: str, signature: str) -> Dict[str, Any]:
        """
        Parse and validate callback from Epoint
        
        Args:
            data: Base64 encoded callback data
            signature: Callback signature
            
        Returns:
            Parsed callback data with validation status
            
        Raises:
            ValueError: If signature is invalid
        """
        # Verify signature
        if not self.verify_signature(data, signature):
            raise ValueError("Invalid callback signature")
        
        # Decode data
        decoded = self._decode_data(data)
        
        return {
            "valid": True,
            "data": decoded,
            "order_id": decoded.get("order_id"),
            "status": decoded.get("status"),
            "transaction": decoded.get("transaction"),
            "bank_transaction": decoded.get("bank_transaction"),
            "rrn": decoded.get("rrn"),
            "amount": decoded.get("amount"),
            "code": decoded.get("code"),
            "message": decoded.get("message")
        }


def create_epoint_service(
    public_key: str,
    private_key: str,
    base_url: str
) -> EpointService:
    """
    Factory function to create Epoint service
    
    Args:
        public_key: Epoint merchant public key
        private_key: Epoint merchant private key
        base_url: Base URL for callbacks (e.g., https://bullandbear.website)
        
    Returns:
        Configured EpointService instance
    """
    config = EpointConfig(
        public_key=public_key,
        private_key=private_key,
        success_url=f"{base_url}/payment-success",
        error_url=f"{base_url}/payment-failed",
        result_url=f"{base_url}/api/epoint/callback"
    )
    
    return EpointService(config)
