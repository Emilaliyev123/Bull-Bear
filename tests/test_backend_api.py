"""
Backend API Tests for Bull & Bear Trading Academy
Tests: Auth, Courses, Book, Signals, Admin endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://premium-trading-edu.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@bullbear.com"
ADMIN_PASSWORD = "admin123"


class TestHealthAndRoot:
    """Basic API health checks"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Bull & Bear" in data["message"]
    
    def test_market_data(self):
        """Test market data endpoint"""
        response = requests.get(f"{BASE_URL}/api/market")
        assert response.status_code == 200
        data = response.json()
        assert "forex" in data
        assert "crypto" in data
        assert "indices" in data


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test successful admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["is_admin"] == True
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpass"
        })
        assert response.status_code == 401
    
    def test_get_me_authenticated(self):
        """Test /auth/me with valid token"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["token"]
        
        # Get user info
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
    
    def test_get_me_unauthenticated(self):
        """Test /auth/me without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401


class TestCourses:
    """Course endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_courses(self):
        """Test getting all courses"""
        response = requests.get(f"{BASE_URL}/api/courses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_courses_authenticated(self, admin_token):
        """Test getting courses as admin"""
        response = requests.get(f"{BASE_URL}/api/courses", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Admin should see video URLs
        for course in data:
            if course.get("video_url"):
                assert "/uploads/videos/" in course["video_url"] or "http" in course["video_url"]


class TestBook:
    """Book endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_book_unauthenticated(self):
        """Test getting book without auth - should hide PDF URL"""
        response = requests.get(f"{BASE_URL}/api/book")
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "has_access" in data
        assert data["has_access"] == False
        # PDF URL should be hidden
        assert data.get("pdf_url", "") == ""
    
    def test_get_book_authenticated(self, admin_token):
        """Test getting book as admin - should show PDF URL"""
        response = requests.get(f"{BASE_URL}/api/book", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert data["has_access"] == True
        # Admin should see PDF URL
        assert "pdf_url" in data
    
    def test_update_book(self, admin_token):
        """Test updating book settings"""
        # Get current book data
        get_response = requests.get(f"{BASE_URL}/api/book", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        original_data = get_response.json()
        
        # Update book
        update_data = {
            "title": "TEST_Book_Title",
            "description": original_data.get("description", "Test description"),
            "cover_url": original_data.get("cover_url", ""),
            "pdf_url": original_data.get("pdf_url", ""),
            "price": 29.90
        }
        
        response = requests.put(f"{BASE_URL}/api/book", json=update_data, headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        
        # Verify update
        verify_response = requests.get(f"{BASE_URL}/api/book", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        verify_data = verify_response.json()
        assert verify_data["title"] == "TEST_Book_Title"
        
        # Restore original title
        restore_data = {
            "title": original_data.get("title", "Game of Candles"),
            "description": original_data.get("description", ""),
            "cover_url": original_data.get("cover_url", ""),
            "pdf_url": original_data.get("pdf_url", ""),
            "price": original_data.get("price", 29.90)
        }
        requests.put(f"{BASE_URL}/api/book", json=restore_data, headers={
            "Authorization": f"Bearer {admin_token}"
        })


class TestSignals:
    """Signals endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_signals_unauthenticated(self):
        """Test getting signals without auth - should hide prices"""
        response = requests.get(f"{BASE_URL}/api/signals")
        assert response.status_code == 200
        data = response.json()
        assert "signals" in data
        assert "has_access" in data
        assert data["has_access"] == False
        # Prices should be hidden (0)
        for signal in data["signals"]:
            assert signal["entry_price"] == 0
            assert signal["stop_loss"] == 0
    
    def test_get_signals_authenticated(self, admin_token):
        """Test getting signals as admin - should show prices"""
        response = requests.get(f"{BASE_URL}/api/signals", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["has_access"] == True
        # Admin should see actual prices
        for signal in data["signals"]:
            assert signal["entry_price"] != 0 or signal["asset"] == ""


class TestAdmin:
    """Admin endpoint tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_get_stats(self, admin_token):
        """Test admin stats endpoint"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "courses" in data
        assert "signals" in data
        assert "purchases" in data
    
    def test_get_users(self, admin_token):
        """Test admin users endpoint"""
        response = requests.get(f"{BASE_URL}/api/admin/users", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least admin user
        assert len(data) >= 1
    
    def test_admin_endpoints_require_auth(self):
        """Test that admin endpoints require authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/stats")
        assert response.status_code == 401
        
        response = requests.get(f"{BASE_URL}/api/admin/users")
        assert response.status_code == 401


class TestNews:
    """News endpoint tests"""
    
    def test_get_news(self):
        """Test getting news articles"""
        response = requests.get(f"{BASE_URL}/api/news")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestStaticFiles:
    """Test static file serving"""
    
    def test_video_file_headers(self):
        """Test that video files are served with correct headers via /api/uploads/"""
        response = requests.head(f"{BASE_URL}/api/uploads/videos/e4d1e078-5290-4735-a5f2-d577a8758cd8.mov")
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'video/quicktime'
    
    def test_pdf_file_headers(self):
        """Test that PDF files are served with correct headers via /api/uploads/"""
        response = requests.head(f"{BASE_URL}/api/uploads/pdfs/6e534a92-b51e-4bbc-9673-3806b83a1d89.pdf")
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'application/pdf'


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
