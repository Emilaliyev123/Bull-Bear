#!/usr/bin/env python3
"""
Bull & Bear Trading Academy - Backend API Testing
Tests all API endpoints for the trading academy platform
"""

import requests
import sys
import json
from datetime import datetime

class BullBearAPITester:
    def __init__(self, base_url="https://premium-trading-edu.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.admin_user_id = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    {details}")
        if success:
            self.tests_passed += 1
        else:
            self.failed_tests.append({"test": name, "details": details})
        print()

    def make_request(self, method, endpoint, data=None, token=None, expected_status=200):
        """Make HTTP request with error handling"""
        url = f"{self.api_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            
            success = response.status_code == expected_status
            return success, response
        except Exception as e:
            return False, str(e)

    def test_root_endpoint(self):
        """Test API root endpoint"""
        success, response = self.make_request('GET', '/')
        if success:
            data = response.json()
            if 'Bull & Bear Trading Academy API' in data.get('message', ''):
                self.log_test("API Root Endpoint", True, f"Message: {data.get('message')}")
            else:
                self.log_test("API Root Endpoint", False, "Unexpected response format")
        else:
            self.log_test("API Root Endpoint", False, f"Request failed: {response}")

    def test_market_data(self):
        """Test market data endpoint (mocked API)"""
        success, response = self.make_request('GET', '/market')
        if success:
            data = response.json()
            required_keys = ['forex', 'crypto', 'indices']
            if all(key in data for key in required_keys):
                # Check if each category has data
                forex_count = len(data.get('forex', []))
                crypto_count = len(data.get('crypto', []))
                indices_count = len(data.get('indices', []))
                self.log_test("Market Data API", True, 
                    f"Forex: {forex_count}, Crypto: {crypto_count}, Indices: {indices_count}")
            else:
                self.log_test("Market Data API", False, "Missing required market categories")
        else:
            self.log_test("Market Data API", False, f"Request failed: {response}")

    def test_admin_login(self):
        """Test admin login with provided credentials"""
        login_data = {
            "email": "admin@bullbear.com",
            "password": "admin123"
        }
        success, response = self.make_request('POST', '/auth/login', login_data)
        if success:
            data = response.json()
            if 'token' in data and 'user' in data:
                self.admin_token = data['token']
                self.admin_user_id = data['user']['id']
                is_admin = data['user'].get('is_admin', False)
                self.log_test("Admin Login", True, 
                    f"Admin status: {is_admin}, User ID: {self.admin_user_id}")
                return True
            else:
                self.log_test("Admin Login", False, "Missing token or user in response")
        else:
            self.log_test("Admin Login", False, f"Login failed: {response}")
        return False

    def test_user_registration(self):
        """Test user registration"""
        test_user = {
            "name": f"Test User {datetime.now().strftime('%H%M%S')}",
            "email": f"test{datetime.now().strftime('%H%M%S')}@example.com",
            "password": "testpass123"
        }
        success, response = self.make_request('POST', '/auth/register', test_user)
        if success:
            data = response.json()
            if 'token' in data and 'user' in data:
                self.token = data['token']
                self.log_test("User Registration", True, f"User: {data['user']['name']}")
                return True
            else:
                self.log_test("User Registration", False, "Missing token or user in response")
        else:
            self.log_test("User Registration", False, f"Registration failed: {response}")
        return False

    def test_auth_me(self):
        """Test get current user endpoint"""
        if not self.token:
            self.log_test("Auth Me Endpoint", False, "No token available")
            return
        
        success, response = self.make_request('GET', '/auth/me', token=self.token)
        if success:
            data = response.json()
            if 'email' in data and 'name' in data:
                self.log_test("Auth Me Endpoint", True, f"User: {data['name']}")
            else:
                self.log_test("Auth Me Endpoint", False, "Missing user data")
        else:
            self.log_test("Auth Me Endpoint", False, f"Request failed: {response}")

    def test_courses_endpoints(self):
        """Test courses-related endpoints"""
        # Get courses (public)
        success, response = self.make_request('GET', '/courses')
        if success:
            courses = response.json()
            self.log_test("Get Courses", True, f"Found {len(courses)} courses")
            
            # Test course categories
            categories = set(course.get('category') for course in courses)
            expected_categories = {'beginner', 'advanced', 'psychology', 'risk-management', 'technical-analysis'}
            if categories.intersection(expected_categories):
                self.log_test("Course Categories", True, f"Categories: {list(categories)}")
            else:
                self.log_test("Course Categories", False, f"Unexpected categories: {list(categories)}")
        else:
            self.log_test("Get Courses", False, f"Request failed: {response}")

        # Test creating course (admin only)
        if self.admin_token:
            new_course = {
                "title": "Test Course",
                "description": "Test course description",
                "category": "beginner",
                "is_free": True
            }
            success, response = self.make_request('POST', '/courses', new_course, self.admin_token, 200)
            if success:
                self.log_test("Create Course (Admin)", True, "Course created successfully")
            else:
                self.log_test("Create Course (Admin)", False, f"Failed to create course: {response}")

    def test_signals_endpoints(self):
        """Test signals-related endpoints"""
        # Get signals (public - should show locked data)
        success, response = self.make_request('GET', '/signals')
        if success:
            data = response.json()
            signals = data.get('signals', [])
            has_access = data.get('has_access', False)
            self.log_test("Get Signals (Public)", True, 
                f"Signals: {len(signals)}, Access: {has_access}")
        else:
            self.log_test("Get Signals (Public)", False, f"Request failed: {response}")

        # Test creating signal (admin only)
        if self.admin_token:
            new_signal = {
                "asset": "TEST/USD",
                "direction": "BUY",
                "entry_price": 1.2345,
                "stop_loss": 1.2000,
                "take_profit_1": 1.2700,
                "risk_note": "Test signal"
            }
            success, response = self.make_request('POST', '/signals', new_signal, self.admin_token, 200)
            if success:
                self.log_test("Create Signal (Admin)", True, "Signal created successfully")
            else:
                self.log_test("Create Signal (Admin)", False, f"Failed to create signal: {response}")

    def test_book_endpoint(self):
        """Test book endpoint"""
        success, response = self.make_request('GET', '/book')
        if success:
            data = response.json()
            if 'title' in data and 'price' in data:
                price = data.get('price', 0)
                has_access = data.get('has_access', False)
                self.log_test("Get Book Info", True, 
                    f"Price: ${price}, Access: {has_access}")
            else:
                self.log_test("Get Book Info", False, "Missing book data")
        else:
            self.log_test("Get Book Info", False, f"Request failed: {response}")

    def test_news_endpoints(self):
        """Test news-related endpoints"""
        # Get news
        success, response = self.make_request('GET', '/news')
        if success:
            news = response.json()
            self.log_test("Get News", True, f"Found {len(news)} articles")
        else:
            self.log_test("Get News", False, f"Request failed: {response}")

        # Test creating news (admin only)
        if self.admin_token:
            new_article = {
                "title": "Test News Article",
                "content": "This is a test news article content.",
                "tags": ["test", "market"]
            }
            success, response = self.make_request('POST', '/news', new_article, self.admin_token, 200)
            if success:
                self.log_test("Create News (Admin)", True, "News article created successfully")
            else:
                self.log_test("Create News (Admin)", False, f"Failed to create news: {response}")

    def test_purchase_endpoints(self):
        """Test purchase endpoints"""
        if not self.token:
            self.log_test("Purchase Endpoints", False, "No user token available")
            return

        # Test course purchase
        success, response = self.make_request('POST', '/purchase/course', {}, self.token, 200)
        if success:
            self.log_test("Purchase Course", True, "Course purchase successful")
        else:
            self.log_test("Purchase Course", False, f"Purchase failed: {response}")

        # Test getting purchases
        success, response = self.make_request('GET', '/purchases', token=self.token)
        if success:
            purchases = response.json()
            self.log_test("Get Purchases", True, f"Found {len(purchases)} purchases")
        else:
            self.log_test("Get Purchases", False, f"Request failed: {response}")

    def test_admin_endpoints(self):
        """Test admin-specific endpoints"""
        if not self.admin_token:
            self.log_test("Admin Endpoints", False, "No admin token available")
            return

        # Test admin stats
        success, response = self.make_request('GET', '/admin/stats', token=self.admin_token)
        if success:
            stats = response.json()
            required_stats = ['users', 'courses', 'signals', 'purchases']
            if all(key in stats for key in required_stats):
                self.log_test("Admin Stats", True, 
                    f"Users: {stats['users']}, Courses: {stats['courses']}, Signals: {stats['signals']}")
            else:
                self.log_test("Admin Stats", False, "Missing required stats")
        else:
            self.log_test("Admin Stats", False, f"Request failed: {response}")

        # Test get users
        success, response = self.make_request('GET', '/admin/users', token=self.admin_token)
        if success:
            users = response.json()
            self.log_test("Admin Get Users", True, f"Found {len(users)} users")
        else:
            self.log_test("Admin Get Users", False, f"Request failed: {response}")

    def test_unauthorized_access(self):
        """Test that admin endpoints reject non-admin users"""
        if not self.token:
            self.log_test("Unauthorized Access Test", False, "No user token available")
            return

        # Try to access admin stats with regular user token
        success, response = self.make_request('GET', '/admin/stats', token=self.token, expected_status=403)
        if success:
            self.log_test("Unauthorized Access Prevention", True, "Admin endpoint properly protected")
        else:
            self.log_test("Unauthorized Access Prevention", False, "Admin endpoint not properly protected")

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Bull & Bear Trading Academy API Tests")
        print("=" * 60)
        
        # Basic API tests
        self.test_root_endpoint()
        self.test_market_data()
        
        # Authentication tests
        admin_login_success = self.test_admin_login()
        user_reg_success = self.test_user_registration()
        
        if user_reg_success:
            self.test_auth_me()
        
        # Core functionality tests
        self.test_courses_endpoints()
        self.test_signals_endpoints()
        self.test_book_endpoint()
        self.test_news_endpoints()
        
        if user_reg_success:
            self.test_purchase_endpoints()
            self.test_unauthorized_access()
        
        if admin_login_success:
            self.test_admin_endpoints()
        
        # Print summary
        print("=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for test in self.failed_tests:
                print(f"  - {test['test']}: {test['details']}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"\n✨ Success Rate: {success_rate:.1f}%")
        
        return success_rate >= 80  # Consider 80%+ success rate as passing

def main():
    """Main test execution"""
    tester = BullBearAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())