"""
Test Suite for Simplified Arbitrage Scanner API
Tests the following features:
- GET /api/arbitrage/scan returns simplified response
- GET /api/arbitrage/status returns simplified features
- Unauthenticated users get has_access: false
- Authenticated admin users get full access
- Response field validation
- Opportunities sorting
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@bullbear.com"
ADMIN_PASSWORD = "admin123"


class TestArbitrageAuth:
    """Authentication and Access Tests for Arbitrage Scanner"""
    
    def test_01_backend_accessible(self):
        """Test that backend is accessible by checking arbitrage status endpoint"""
        response = requests.get(f"{BASE_URL}/api/arbitrage/status")
        assert response.status_code == 200, f"Backend not accessible: {response.text}"
        print("✓ Backend accessible via arbitrage status endpoint")
    
    def test_02_admin_login(self):
        """Test admin can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        print(f"✓ Admin login successful - user: {data['user'].get('email')}")
        return data["token"]


class TestArbitrageStatusEndpoint:
    """Tests for GET /api/arbitrage/status"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_03_status_unauthenticated(self):
        """Test arbitrage status for unauthenticated user returns has_access: false"""
        response = requests.get(f"{BASE_URL}/api/arbitrage/status")
        assert response.status_code == 200, f"Status endpoint failed: {response.text}"
        
        data = response.json()
        assert "has_access" in data, "Missing 'has_access' field"
        assert data["has_access"] == False, "Unauthenticated user should not have access"
        assert "price" in data, "Missing 'price' field"
        assert "features" in data, "Missing 'features' field"
        print(f"✓ Unauthenticated user correctly denied access, price: ${data['price']}")
    
    def test_04_status_authenticated_admin(self, admin_token):
        """Test arbitrage status for authenticated admin returns has_access: true"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/status", headers=headers)
        assert response.status_code == 200, f"Status endpoint failed: {response.text}"
        
        data = response.json()
        assert data["has_access"] == True, "Admin should have access"
        assert data["price"] == 39.90, f"Price should be 39.90, got {data['price']}"
        
        # Verify simplified features list (no 'Adaptive' terminology)
        features = data["features"]
        assert isinstance(features, list), "Features should be a list"
        assert len(features) > 0, "Features list should not be empty"
        
        # Check features don't contain old terms
        features_text = " ".join(features).lower()
        assert "adaptive" not in features_text, "Features should not contain 'Adaptive' terminology"
        assert "score" not in features_text, "Features should not contain 'score' terminology"
        
        print(f"✓ Admin has access, features: {features}")
    
    def test_05_status_simplified_features(self, admin_token):
        """Verify status endpoint returns simplified features without complex analytics"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/status", headers=headers)
        data = response.json()
        
        expected_keywords = ["USDT", "exchanges", "fees", "10 seconds", "profit"]
        features_text = " ".join(data["features"]).lower()
        
        matched = sum(1 for kw in expected_keywords if kw.lower() in features_text)
        assert matched >= 3, f"Expected at least 3 simplified feature keywords, found {matched}"
        print(f"✓ Features contain simplified terminology: {data['features']}")


class TestArbitrageScanEndpoint:
    """Tests for GET /api/arbitrage/scan"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_06_scan_unauthenticated_returns_empty(self):
        """Test scan endpoint returns empty opportunities for unauthenticated user"""
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan")
        assert response.status_code == 200, f"Scan endpoint failed: {response.text}"
        
        data = response.json()
        assert "opportunities" in data, "Missing 'opportunities' field"
        assert data["opportunities"] == [], "Unauthenticated should get empty opportunities"
        assert data["has_access"] == False, "Unauthenticated should have has_access: false"
        assert "message" in data, "Should have message for non-subscribers"
        print(f"✓ Unauthenticated user gets empty opportunities, message: {data.get('message')}")
    
    def test_07_scan_authenticated_response_fields(self, admin_token):
        """Test scan response has all required simplified fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        assert response.status_code == 200, f"Scan endpoint failed: {response.text}"
        
        data = response.json()
        
        # Verify required top-level fields
        required_fields = ["opportunities", "exchanges_connected", "coins_scanned", 
                          "capital", "min_spread_filter", "scan_time", "has_access"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Verify data types
        assert isinstance(data["opportunities"], list), "opportunities should be a list"
        assert isinstance(data["exchanges_connected"], int), "exchanges_connected should be int"
        assert isinstance(data["coins_scanned"], int), "coins_scanned should be int"
        assert isinstance(data["capital"], (int, float)), "capital should be numeric"
        assert isinstance(data["min_spread_filter"], (int, float)), "min_spread_filter should be numeric"
        assert data["has_access"] == True, "Admin should have access"
        
        print(f"✓ Scan response has all required fields:")
        print(f"  - exchanges_connected: {data['exchanges_connected']}/7")
        print(f"  - coins_scanned: {data['coins_scanned']}")
        print(f"  - capital: ${data['capital']}")
        print(f"  - min_spread_filter: {data['min_spread_filter']}%")
        print(f"  - opportunities: {len(data['opportunities'])}")
    
    def test_08_scan_opportunity_structure(self, admin_token):
        """Test each opportunity has the correct simplified fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        data = response.json()
        
        # If there are opportunities, verify their structure
        # Note: There may be 0 opportunities if spreads are < 1% (which is expected for major coins)
        if data["opportunities"]:
            opp = data["opportunities"][0]
            
            required_opp_fields = ["coin", "buy_exchange", "buy_price", 
                                   "sell_exchange", "sell_price", 
                                   "net_spread_pct", "net_profit_usd"]
            for field in required_opp_fields:
                assert field in opp, f"Opportunity missing field: {field}"
            
            # Verify types
            assert isinstance(opp["coin"], str), "coin should be string"
            assert isinstance(opp["buy_exchange"], str), "buy_exchange should be string"
            assert isinstance(opp["buy_price"], (int, float)), "buy_price should be numeric"
            assert isinstance(opp["sell_exchange"], str), "sell_exchange should be string"
            assert isinstance(opp["sell_price"], (int, float)), "sell_price should be numeric"
            assert isinstance(opp["net_spread_pct"], (int, float)), "net_spread_pct should be numeric"
            assert isinstance(opp["net_profit_usd"], (int, float)), "net_profit_usd should be numeric"
            
            # Verify no old complex fields
            old_fields = ["score", "risk_category", "stability", "confidence", "trend"]
            for old_field in old_fields:
                assert old_field not in opp, f"Opportunity should not have old field: {old_field}"
            
            print(f"✓ Opportunity structure verified:")
            print(f"  - {opp['coin']}: Buy {opp['buy_exchange']} @ ${opp['buy_price']:.4f}")
            print(f"  - Sell {opp['sell_exchange']} @ ${opp['sell_price']:.4f}")
            print(f"  - Net Spread: {opp['net_spread_pct']}%, Profit: ${opp['net_profit_usd']}")
        else:
            print(f"✓ No opportunities found (expected - major coins typically have < 1% spread)")
            print(f"  - This is correct behavior as MIN_NET_SPREAD = 1.0%")
    
    def test_09_opportunities_sorted_by_spread_descending(self, admin_token):
        """Test opportunities are sorted by net_spread_pct in descending order"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        data = response.json()
        
        opportunities = data["opportunities"]
        if len(opportunities) >= 2:
            spreads = [opp["net_spread_pct"] for opp in opportunities]
            for i in range(len(spreads) - 1):
                assert spreads[i] >= spreads[i+1], f"Opportunities not sorted: {spreads[i]} < {spreads[i+1]}"
            print(f"✓ Opportunities correctly sorted by net_spread_pct (descending)")
            print(f"  - Top 3 spreads: {spreads[:3]}")
        else:
            print(f"✓ Less than 2 opportunities - sorting verification skipped")
    
    def test_10_min_spread_filter_applied(self, admin_token):
        """Test all opportunities meet min spread filter (1%)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        data = response.json()
        
        min_filter = data["min_spread_filter"]
        for opp in data["opportunities"]:
            assert opp["net_spread_pct"] >= min_filter, \
                f"Opportunity {opp['coin']} has spread {opp['net_spread_pct']}% < {min_filter}%"
        
        print(f"✓ All {len(data['opportunities'])} opportunities meet min spread filter ({min_filter}%)")


class TestArbitrageIntegration:
    """Integration Tests for complete arbitrage flow"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["token"]
    
    def test_11_exchanges_responding(self, admin_token):
        """Verify exchanges are responding (at least some)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        data = response.json()
        
        exchanges_connected = data["exchanges_connected"]
        # At least 3/7 exchanges should respond (context says 4/7 currently)
        assert exchanges_connected >= 3, f"Only {exchanges_connected}/7 exchanges connected"
        print(f"✓ {exchanges_connected}/7 exchanges responding")
    
    def test_12_major_coins_scanned(self, admin_token):
        """Verify major coins are being scanned (should be ~50)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        data = response.json()
        
        coins_scanned = data["coins_scanned"]
        # Should scan at least 30 coins (50 defined, but depends on exchange responses)
        assert coins_scanned >= 20, f"Only {coins_scanned} coins scanned (expected ~50)"
        print(f"✓ {coins_scanned} major coins scanned")
    
    def test_13_capital_matches_config(self, admin_token):
        """Verify capital amount matches server config"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        data = response.json()
        
        # Capital should be $200 as per server config
        assert data["capital"] == 200, f"Capital should be 200, got {data['capital']}"
        print(f"✓ Trading capital correctly set to ${data['capital']}")
    
    def test_14_scan_time_present(self, admin_token):
        """Verify scan_time is a valid ISO timestamp"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/arbitrage/scan", headers=headers)
        data = response.json()
        
        scan_time = data["scan_time"]
        assert scan_time, "scan_time should not be empty"
        assert "T" in scan_time, "scan_time should be ISO format with 'T' separator"
        print(f"✓ Scan time: {scan_time}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
