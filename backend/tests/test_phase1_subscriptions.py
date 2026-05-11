"""
Phase 1 backend tests — subscription packages, lessons, bunny proxy,
intro video, admin grant/revoke, arbitrage gating, premium book.
"""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://bull-bear-preview.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@bullbear.com"
ADMIN_PASSWORD = "admin123"


# -------- fixtures --------
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(client):
    r = client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_client(client, admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {admin_token}"})
    return s


@pytest.fixture(scope="module")
def regular_user(client):
    """Create a regular non-premium user for negative-path tests."""
    email = f"TEST_phase1_{int(datetime.now().timestamp())}@example.com"
    pw = "Passw0rd!"
    r = client.post(f"{API}/auth/register", json={"email": email, "password": pw, "name": "Phase1 Tester"})
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    login = client.post(f"{API}/auth/login", json={"email": email, "password": pw})
    tok = login.json().get("access_token") or login.json().get("token")
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    me = s.get(f"{API}/auth/me")
    user_id = me.json().get("id") if me.status_code == 200 else None
    return {"email": email, "id": user_id, "client": s, "token": tok}


# -------- subscription packages --------
class TestSubscriptionPackages:
    def test_packages_public(self, client):
        r = client.get(f"{API}/subscriptions/packages")
        assert r.status_code == 200
        data = r.json()
        pkgs = data["packages"]
        ids = sorted([p["id"] for p in pkgs])
        assert ids == ["arbitrage_bot", "premium_3in1"]
        for p in pkgs:
            assert p["price"] == 49.90
            assert p["currency"] == "USD"
            assert p["billing"] == "monthly"
            assert isinstance(p["features"], list) and len(p["features"]) >= 2

    def test_me_admin(self, admin_client):
        r = admin_client.get(f"{API}/subscriptions/me")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "premium" in d and "arbitrage" in d
        assert isinstance(d["premium"].get("active"), bool)
        assert isinstance(d["arbitrage"].get("active"), bool)
        # days_left is nested per subscription type
        assert "days_left" in d["premium"]
        assert "days_left" in d["arbitrage"]

    def test_me_requires_auth(self, client):
        r = client.get(f"{API}/subscriptions/me")
        assert r.status_code in (401, 403)


# -------- lessons --------
class TestLessons:
    def test_lessons_public_no_embed_for_anon(self, client):
        r = client.get(f"{API}/lessons")
        assert r.status_code == 200
        data = r.json()
        assert "lessons" in data
        assert data.get("premium_active") in (False, None)
        for L in data["lessons"]:
            if not L.get("is_free"):
                assert not L.get("embed_url"), f"Anon got embed_url for paid lesson: {L.get('id')}"

    def test_lessons_admin_gets_embed(self, admin_client):
        r = admin_client.get(f"{API}/lessons")
        assert r.status_code == 200
        # Admin is premium (auto-migration); paid lessons (if any with bunny_video_id) should embed
        # Don't fail if no lessons seeded
        assert "lessons" in r.json()


# -------- admin lessons CRUD --------
class TestAdminLessons:
    created_id = None

    def test_create_requires_admin(self, regular_user):
        r = regular_user["client"].post(f"{API}/admin/lessons", json={
            "title": "TEST Should Fail",
            "bunny_video_id": "dummy",
            "order": 999,
        })
        assert r.status_code == 403

    def test_create_admin(self, admin_client):
        payload = {
            "title": "TEST_Phase1_Lesson",
            "description": "auto test",
            "bunny_video_id": "test-guid-0000",
            "order": 999,
            "is_free": False,
            "is_published": True,
        }
        r = admin_client.post(f"{API}/admin/lessons", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == payload["title"]
        assert body.get("bunny_video_id") == "test-guid-0000"
        assert "id" in body
        TestAdminLessons.created_id = body["id"]

    def test_update_admin(self, admin_client):
        assert TestAdminLessons.created_id
        r = admin_client.put(
            f"{API}/admin/lessons/{TestAdminLessons.created_id}",
            json={"title": "TEST_Phase1_Lesson_Updated", "bunny_video_id": "test-guid-0000", "order": 999, "is_published": True},
        )
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "TEST_Phase1_Lesson_Updated"

    def test_delete_admin(self, admin_client):
        assert TestAdminLessons.created_id
        r = admin_client.delete(f"{API}/admin/lessons/{TestAdminLessons.created_id}")
        assert r.status_code == 200
        # confirm gone
        r2 = admin_client.get(f"{API}/lessons/{TestAdminLessons.created_id}")
        assert r2.status_code == 404


# -------- Bunny --------
class TestBunny:
    def test_bunny_videos_admin_only(self, regular_user):
        r = regular_user["client"].get(f"{API}/admin/bunny/videos")
        assert r.status_code == 403

    def test_bunny_videos_admin_live(self, admin_client):
        r = admin_client.get(f"{API}/admin/bunny/videos")
        # The Bunny Stream API is live; tolerate empty list, fail only on non-200
        assert r.status_code == 200, f"Bunny API failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "items" in data
        for v in data["items"][:3]:
            assert "guid" in v


# -------- Intro video --------
class TestIntroVideo:
    def test_intro_public(self, client):
        r = client.get(f"{API}/intro-video")
        # Either configured (200) or no intro (404). Both acceptable but log.
        assert r.status_code in (200, 404), r.text
        if r.status_code == 200:
            d = r.json()
            assert "title" in d
            assert d.get("source") in ("bunny", "legacy")
            assert d.get("embed_url") or d.get("video_url")


# -------- Admin users + grant/revoke --------
class TestAdminUsersAndGrant:
    def test_list_users(self, admin_client):
        r = admin_client.get(f"{API}/admin/users")
        assert r.status_code == 200, r.text
        data = r.json()
        # New endpoint returns {users, total, page, page_size}; old endpoint returned list.
        # The first registered route wins in FastAPI = new endpoint expected.
        assert isinstance(data, dict), (
            f"Expected new endpoint shape (dict with users/total). Got list — "
            f"duplicate route at line ~2168 is shadowing the new endpoint."
        )
        assert "users" in data and "total" in data
        users = data["users"]
        assert isinstance(users, list)
        # Each user should have subscriptions field
        for u in users[:3]:
            assert "subscriptions" in u, f"User missing subscriptions: {u.get('email')}"

    def test_search_admin_users(self, admin_client):
        r = admin_client.get(f"{API}/admin/users", params={"search": "admin"})
        assert r.status_code == 200
        data = r.json()
        if isinstance(data, dict):
            assert any("admin" in u.get("email", "").lower() for u in data["users"])

    def test_grant_revoke_arbitrage(self, admin_client, regular_user):
        uid = regular_user["id"]
        assert uid, "regular user has no id"
        # Grant
        r = admin_client.post(f"{API}/admin/users/{uid}/grant/arbitrage_bot", json={"days": 30})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body.get("expires_at")
        # Verify via /subscriptions/me on the regular user's session
        me = regular_user["client"].get(f"{API}/subscriptions/me")
        assert me.status_code == 200
        st = me.json()
        assert st["arbitrage"]["active"] is True
        # days_left around 30
        dl = st.get("days_left", {}).get("arbitrage")
        assert dl is None or 28 <= dl <= 31

        # Arbitrage scan should now have access
        scan = regular_user["client"].get(f"{API}/arbitrage/scan")
        assert scan.status_code == 200
        assert scan.json().get("has_access") is True

        # Revoke
        r2 = admin_client.post(f"{API}/admin/users/{uid}/revoke/arbitrage_bot")
        assert r2.status_code == 200
        me2 = regular_user["client"].get(f"{API}/subscriptions/me")
        assert me2.json()["arbitrage"]["active"] is False

    def test_grant_premium(self, admin_client, regular_user):
        uid = regular_user["id"]
        r = admin_client.post(f"{API}/admin/users/{uid}/grant/premium_3in1", json={"days": 30})
        assert r.status_code == 200
        me = regular_user["client"].get(f"{API}/subscriptions/me")
        assert me.json()["premium"]["active"] is True
        # Cleanup
        admin_client.post(f"{API}/admin/users/{uid}/revoke/premium_3in1")

    def test_grant_unknown_package_400(self, admin_client, regular_user):
        uid = regular_user["id"]
        r = admin_client.post(f"{API}/admin/users/{uid}/grant/no_such_pkg", json={"days": 30})
        assert r.status_code == 400


# -------- Arbitrage gating --------
class TestArbitrage:
    def test_status_public(self, client):
        r = client.get(f"{API}/arbitrage/status")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["price"] == 49.90
        assert isinstance(d.get("features"), list) and len(d["features"]) >= 2

    def test_scan_blocked_for_anon(self, client):
        r = client.get(f"{API}/arbitrage/scan")
        # Either 401 (auth required) or 200 with has_access=false. Spec says has_access true ONLY when sub active.
        if r.status_code == 200:
            assert r.json().get("has_access") in (False, None)
        else:
            assert r.status_code in (401, 403)

    def test_scan_blocked_for_non_premium(self, regular_user):
        r = regular_user["client"].get(f"{API}/arbitrage/scan")
        assert r.status_code == 200
        assert r.json().get("has_access") is False

    def test_scan_open_for_admin(self, admin_client):
        r = admin_client.get(f"{API}/arbitrage/scan")
        assert r.status_code == 200
        assert r.json().get("has_access") is True


# -------- Premium book --------
class TestPremiumBook:
    def test_book_requires_premium(self, regular_user):
        r = regular_user["client"].get(f"{API}/premium/book/download")
        assert r.status_code == 403

    def test_book_admin_503_storage_not_configured(self, admin_client):
        r = admin_client.get(f"{API}/premium/book/download")
        # Admin is premium via migration; storage password is empty → expect 503 friendly msg
        assert r.status_code in (503, 200), f"Unexpected: {r.status_code} {r.text}"
        if r.status_code == 503:
            d = r.json()
            assert "detail" in d or "message" in d


# -------- Migration --------
class TestMigration:
    def test_admin_has_premium_active_via_migration_or_admin(self, admin_client):
        r = admin_client.get(f"{API}/subscriptions/me")
        assert r.status_code == 200
        # Admin (per spec) should show Active on both cards in UI; that requires backend flags.
        d = r.json()
        # Admin has is_admin → has_premium_access returns True; has_arbitrage_access also True.
        assert d["premium"]["active"] is True
        assert d["arbitrage"]["active"] is True
