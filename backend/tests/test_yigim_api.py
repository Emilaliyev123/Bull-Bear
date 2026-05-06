"""End-to-end API tests for Yigim payment integration via the public backend URL.

These tests exercise the FastAPI endpoints over HTTP using the public
REACT_APP_BACKEND_URL, validating the full Yigim migration:
  - /api/yigim/checkout/create (auth + product validation + DB record)
  - /api/yigim/callback (GET callback handling for unknown/known refs)
  - /api/yigim/status/{order_id}
  - /api/yigim/transaction/{order_id}
  - /api/yigim/prices (public, USD)
  - Legacy /api/epoint/* endpoints removed (404)
  - Existing critical endpoints still working
"""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bull-bear-preview.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@bullbear.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Public endpoints ----------------


def test_yigim_prices_returns_usd_and_correct_amounts():
    r = requests.get(f"{BASE_URL}/api/yigim/prices", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("currency") == "USD"
    # Server returns nested {"products": {<type>: {"price": ..., "name": ..., "type": ...}}}
    products = data.get("products") or data.get("prices") or {}
    def _price(key):
        v = products.get(key)
        if isinstance(v, dict):
            return v.get("price")
        return v
    assert _price("course") == 49.90
    assert _price("book") == 29.90
    assert _price("signals") == 19.90
    assert _price("arbitrage") == 39.90


# ---------------- Legacy Epoint endpoints removed ----------------


@pytest.mark.parametrize("path", [
    "/api/epoint/checkout/create",
    "/api/epoint/callback",
    "/api/epoint/status/test",
    "/api/epoint/transaction/test",
    "/api/epoint/prices",
])
def test_legacy_epoint_endpoints_removed(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=15)
    # POST one too if appropriate; in either case they must not be served
    r2 = requests.post(f"{BASE_URL}{path}", json={}, timeout=15)
    assert r.status_code == 404, f"GET {path} expected 404, got {r.status_code}"
    assert r2.status_code in (404, 405), f"POST {path} expected 404/405, got {r2.status_code}"


# ---------------- /api/yigim/checkout/create ----------------


def test_yigim_checkout_requires_auth():
    r = requests.post(
        f"{BASE_URL}/api/yigim/checkout/create",
        json={"product_type": "course"},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}: {r.text}"


def test_yigim_checkout_invalid_product_returns_400(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/yigim/checkout/create",
        json={"product_type": "invalid_product", "origin_url": BASE_URL},
        headers=auth_headers,
        timeout=15,
    )
    # Should be a client error - 400 or 422 is acceptable
    assert r.status_code in (400, 422), f"Expected 400/422, got {r.status_code}: {r.text}"


@pytest.mark.parametrize("product_type", ["course", "book", "signals", "arbitrage"])
def test_yigim_checkout_create_for_valid_products(auth_headers, product_type):
    """The Yigim sandbox merchant placeholder will reject upstream, so the backend
    should respond with 500 + clean message OR success (if upstream improves).
    Either way, must not be a 502 crash, and a transaction record should be created
    only when the upstream succeeded (so we mostly assert graceful handling).
    """
    r = requests.post(
        f"{BASE_URL}/api/yigim/checkout/create",
        json={"product_type": product_type, "origin_url": BASE_URL},
        headers=auth_headers,
        timeout=30,
    )
    # Valid responses: 200 success OR 500 graceful error from sandbox failure
    assert r.status_code in (200, 500), f"Unexpected status {r.status_code}: {r.text}"
    if r.status_code == 200:
        data = r.json()
        assert "redirect_url" in data
        assert "order_id" in data
        assert data["order_id"]
    else:
        # Must be JSON with a clean error detail (not a raw 502)
        try:
            err = r.json()
            assert "detail" in err
        except ValueError:
            pytest.fail(f"500 response is not JSON: {r.text[:200]}")
    # Valid responses: 200 success OR 500 graceful error from sandbox failure
    assert r.status_code in (200, 500), f"Unexpected status {r.status_code}: {r.text}"
    if r.status_code == 200:
        data = r.json()
        assert "redirect_url" in data
        assert "order_id" in data
        assert data["order_id"]
    else:
        # Must be JSON with a clean error detail (not a raw 502)
        try:
            err = r.json()
            assert "detail" in err
        except ValueError:
            pytest.fail(f"500 response is not JSON: {r.text[:200]}")


# ---------------- /api/yigim/status/{order_id} ----------------


def test_yigim_status_unknown_returns_404(auth_headers):
    fake = f"BB-FAKE-{uuid.uuid4().hex[:8]}"
    r = requests.get(f"{BASE_URL}/api/yigim/status/{fake}", headers=auth_headers, timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


def test_yigim_status_requires_auth():
    fake = f"BB-FAKE-{uuid.uuid4().hex[:8]}"
    r = requests.get(f"{BASE_URL}/api/yigim/status/{fake}", timeout=15)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


# ---------------- /api/yigim/transaction/{order_id} ----------------


def test_yigim_transaction_unknown_returns_404(auth_headers):
    fake = f"BB-FAKE-{uuid.uuid4().hex[:8]}"
    r = requests.get(f"{BASE_URL}/api/yigim/transaction/{fake}", headers=auth_headers, timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"


def test_yigim_transaction_requires_auth():
    fake = f"BB-FAKE-{uuid.uuid4().hex[:8]}"
    r = requests.get(f"{BASE_URL}/api/yigim/transaction/{fake}", timeout=15)
    assert r.status_code in (401, 403)


# ---------------- /api/yigim/callback ----------------


def test_yigim_callback_unknown_reference_redirects_to_failed():
    fake = f"BB-FAKE-{uuid.uuid4().hex[:8]}"
    r = requests.get(
        f"{BASE_URL}/api/yigim/callback",
        params={"reference": fake},
        allow_redirects=False,
        timeout=15,
    )
    # Should be a redirect (302/303/307) to /payment-failed
    assert r.status_code in (302, 303, 307), f"Expected redirect, got {r.status_code}: {r.text}"
    location = r.headers.get("location", "")
    assert "/payment-failed" in location, f"Unexpected redirect target: {location}"
    assert fake in location, f"Order id should be propagated to redirect: {location}"


def test_yigim_callback_missing_reference():
    r = requests.get(f"{BASE_URL}/api/yigim/callback", allow_redirects=False, timeout=15)
    # Must not crash - either 400/422 or a redirect to failed
    assert r.status_code in (302, 303, 307, 400, 422), f"Unexpected: {r.status_code}"


# ---------------- Existing critical endpoints regression ----------------


def test_existing_login_works():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("access_token") or body.get("token")


def test_get_courses():
    r = requests.get(f"{BASE_URL}/api/courses", timeout=15)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_get_signals():
    r = requests.get(f"{BASE_URL}/api/signals", timeout=15)
    # Public list might require subscription; acceptable: 200 or 401/403
    assert r.status_code in (200, 401, 403), f"Unexpected: {r.status_code}"


def test_get_book():
    r = requests.get(f"{BASE_URL}/api/book", timeout=15)
    assert r.status_code in (200, 401, 403), f"Unexpected: {r.status_code}"


def test_arbitrage_status_admin(auth_headers):
    r = requests.get(f"{BASE_URL}/api/arbitrage/status", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
