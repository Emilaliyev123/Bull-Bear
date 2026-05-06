"""
Tests for Yigim payment entitlement-grant logic.

This is the most critical regression test for Bull & Bear: making sure that
when Yigim reports a payment as approved, the user is granted the correct
access flags AND the operation is idempotent (no double-grant).

We mock Yigim's HTTP API so the test does not touch the real sandbox.
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from server import (  # noqa: E402
    db,
    grant_yigim_entitlement,
    _refresh_yigim_status,
)


async def _make_user(email_suffix: str) -> str:
    user_id = str(uuid.uuid4())
    await db.users.insert_one({
        "id": user_id,
        "email": f"yigim-test-{email_suffix}@example.com",
        "name": "Yigim Test",
        "is_admin": False,
        "course_access": False,
        "book_access": False,
        "signals_subscription": False,
        "arbitrage_subscription": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "password_hash": "x",
    })
    return user_id


async def _make_transaction(user_id: str, product_type: str, reference: str, amount: float):
    await db.yigim_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "reference": reference,
        "user_id": user_id,
        "user_email": "test@example.com",
        "product_type": product_type,
        "product_name": f"Test {product_type}",
        "amount": amount,
        "currency": "USD",
        "currency_code": 840,
        "status": "pending",
        "payment_status": "initiated",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _cleanup(user_id: str, reference: str):
    await db.users.delete_one({"id": user_id})
    await db.yigim_transactions.delete_one({"reference": reference})
    await db.purchases.delete_many({"user_id": user_id})


@pytest.mark.asyncio
@pytest.mark.parametrize("product_type,flag,subscription_field", [
    ("course", "course_access", None),
    ("book", "book_access", None),
    ("signals", "signals_subscription", "signals_expiry"),
    ("arbitrage", "arbitrage_subscription", "arbitrage_expiry"),
])
async def test_grant_entitlement_for_each_product(product_type, flag, subscription_field):
    """When grant_yigim_entitlement is called, the matching access flag flips True."""
    user_id = await _make_user(f"{product_type}-{uuid.uuid4().hex[:6]}")
    reference = f"BB-TEST-{uuid.uuid4().hex[:8]}"
    await _make_transaction(user_id, product_type, reference, 49.90)

    transaction = await db.yigim_transactions.find_one({"reference": reference}, {"_id": 0})

    try:
        granted = await grant_yigim_entitlement(transaction)
        assert granted is True, "First call must grant entitlement"

        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        assert user[flag] is True, f"User did not receive {flag}"

        if subscription_field:
            assert subscription_field in user
            assert user[subscription_field], "Subscription expiry must be set"

        purchase = await db.purchases.find_one(
            {"user_id": user_id, "yigim_reference": reference}, {"_id": 0}
        )
        assert purchase is not None, "Purchase record missing"
        assert purchase["payment_method"] == "yigim"
        assert purchase["product_type"] == product_type
    finally:
        await _cleanup(user_id, reference)


@pytest.mark.asyncio
async def test_grant_entitlement_is_idempotent():
    """Calling grant twice for the same reference must not double-create purchases."""
    user_id = await _make_user(f"idem-{uuid.uuid4().hex[:6]}")
    reference = f"BB-IDEM-{uuid.uuid4().hex[:8]}"
    await _make_transaction(user_id, "course", reference, 49.90)

    transaction = await db.yigim_transactions.find_one({"reference": reference}, {"_id": 0})

    try:
        first = await grant_yigim_entitlement(transaction)
        second = await grant_yigim_entitlement(transaction)

        assert first is True
        assert second is False, "Second call must be a no-op"

        count = await db.purchases.count_documents(
            {"user_id": user_id, "yigim_reference": reference}
        )
        assert count == 1, f"Expected 1 purchase, found {count}"
    finally:
        await _cleanup(user_id, reference)


@pytest.mark.asyncio
async def test_refresh_status_grants_on_approved():
    """_refresh_yigim_status grants entitlement when Yigim returns status '00'."""
    user_id = await _make_user(f"approved-{uuid.uuid4().hex[:6]}")
    reference = f"BB-APPROVED-{uuid.uuid4().hex[:8]}"
    await _make_transaction(user_id, "arbitrage", reference, 39.90)

    fake_yigim = AsyncMock()
    fake_yigim.get_payment_status = AsyncMock(return_value={
        "status": "00",
        "message": "Approved",
        "code": 0,
    })
    fake_yigim.is_payment_approved = lambda s: s == "00"

    try:
        with patch("server.get_yigim_service", return_value=fake_yigim):
            updated = await _refresh_yigim_status(reference)

        assert updated["status"] == "success"
        assert updated["payment_status"] == "paid"

        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        assert user["arbitrage_subscription"] is True
        assert "arbitrage_expiry" in user
    finally:
        await _cleanup(user_id, reference)


@pytest.mark.asyncio
async def test_refresh_status_marks_failed_on_decline():
    """_refresh_yigim_status marks failed when Yigim returns a non-pending non-approved code."""
    user_id = await _make_user(f"declined-{uuid.uuid4().hex[:6]}")
    reference = f"BB-DECLINED-{uuid.uuid4().hex[:8]}"
    await _make_transaction(user_id, "course", reference, 49.90)

    fake_yigim = AsyncMock()
    fake_yigim.get_payment_status = AsyncMock(return_value={
        "status": "05",
        "message": "Declined",
    })
    fake_yigim.is_payment_approved = lambda s: s == "00"

    try:
        with patch("server.get_yigim_service", return_value=fake_yigim):
            updated = await _refresh_yigim_status(reference)

        assert updated["status"] == "failed"
        assert updated["payment_status"] == "failed"

        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        assert user["course_access"] is False, "Failed payment must not grant access"
    finally:
        await _cleanup(user_id, reference)


@pytest.mark.asyncio
async def test_refresh_status_pending_remains_pending():
    """If Yigim returns waiting status (S0), do not change status or grant access."""
    user_id = await _make_user(f"pending-{uuid.uuid4().hex[:6]}")
    reference = f"BB-PENDING-{uuid.uuid4().hex[:8]}"
    await _make_transaction(user_id, "course", reference, 49.90)

    fake_yigim = AsyncMock()
    fake_yigim.get_payment_status = AsyncMock(return_value={
        "status": "S0",
        "message": "Waiting for input",
    })
    fake_yigim.is_payment_approved = lambda s: s == "00"

    try:
        with patch("server.get_yigim_service", return_value=fake_yigim):
            updated = await _refresh_yigim_status(reference)

        assert updated["status"] == "pending"
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        assert user["course_access"] is False
    finally:
        await _cleanup(user_id, reference)
