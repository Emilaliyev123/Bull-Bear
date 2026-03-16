"""
Test module for video upload and automatic conversion functionality.
Tests the POST /api/upload/video endpoint that converts MOV, AVI, MKV, WebM to MP4.
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "admin@bullbear.com"
ADMIN_PASSWORD = "admin123"

class TestVideoUpload:
    """Video upload endpoint tests with ffmpeg conversion"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with authorization"""
        return {"Authorization": f"Bearer {auth_token}"}

    def test_01_upload_mp4_no_conversion(self, auth_headers):
        """Test: MP4 files should upload without conversion"""
        # Use the test MP4 file created by ffmpeg
        test_file = "/tmp/test_video.mp4"
        assert os.path.exists(test_file), "Test MP4 file not found"

        with open(test_file, 'rb') as f:
            files = {'file': ('test_video.mp4', f, 'video/mp4')}
            response = requests.post(
                f"{BASE_URL}/api/upload/video",
                headers=auth_headers,
                files=files,
                timeout=60
            )

        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")

        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # MP4 should not need conversion
        assert "url" in data, "Response missing 'url'"
        assert "filename" in data, "Response missing 'filename'"
        assert data.get("converted") == False, "MP4 should not be converted"
        assert data["filename"].endswith(".mp4"), "Filename should be .mp4"
        assert "/api/uploads/videos/" in data["url"], "URL should include /api/uploads/videos/"
        print(f"✓ MP4 upload successful: {data['url']}")

    def test_02_upload_mov_with_conversion(self, auth_headers):
        """Test: MOV files should be auto-converted to MP4"""
        # Use the test MOV file created by ffmpeg
        test_file = "/tmp/test_video_original.mov"
        assert os.path.exists(test_file), "Test MOV file not found"

        with open(test_file, 'rb') as f:
            files = {'file': ('test_video.mov', f, 'video/quicktime')}
            response = requests.post(
                f"{BASE_URL}/api/upload/video",
                headers=auth_headers,
                files=files,
                timeout=120  # Longer timeout for conversion
            )

        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")

        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # MOV should be converted to MP4
        assert "url" in data, "Response missing 'url'"
        assert "filename" in data, "Response missing 'filename'"
        assert data.get("converted") == True, "MOV should be converted to MP4"
        assert "original_format" in data, "Response should include original_format"
        assert data["original_format"] == ".mov", f"Original format should be .mov, got {data.get('original_format')}"
        assert data["filename"].endswith(".mp4"), f"Output filename should be .mp4, got {data['filename']}"
        assert "/api/uploads/videos/" in data["url"], "URL should include /api/uploads/videos/"
        print(f"✓ MOV→MP4 conversion successful: {data['url']}")

    def test_03_converted_file_accessible(self, auth_headers):
        """Test: Converted MP4 files should be accessible via URL with correct content-type"""
        # First upload a MOV to get the converted URL
        test_file = "/tmp/test_video_original.mov"
        
        with open(test_file, 'rb') as f:
            files = {'file': ('test_access.mov', f, 'video/quicktime')}
            upload_response = requests.post(
                f"{BASE_URL}/api/upload/video",
                headers=auth_headers,
                files=files,
                timeout=120
            )

        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        data = upload_response.json()
        video_url = data["url"]
        
        # Now try to access the converted file
        full_url = f"{BASE_URL}{video_url}"
        print(f"Accessing converted video at: {full_url}")
        
        access_response = requests.head(full_url, timeout=30)
        print(f"Access response status: {access_response.status_code}")
        print(f"Content-Type: {access_response.headers.get('Content-Type')}")
        
        assert access_response.status_code == 200, f"File not accessible: {access_response.status_code}"
        content_type = access_response.headers.get('Content-Type', '')
        assert 'video/mp4' in content_type or 'application/octet-stream' in content_type, \
            f"Expected video/mp4 content-type, got: {content_type}"
        print(f"✓ Converted file accessible with correct content-type")

    def test_04_invalid_file_type_rejected(self, auth_headers):
        """Test: Invalid file types (e.g., .txt) should be rejected with 400 error"""
        # Create a temporary text file
        test_file = "/tmp/test_invalid.txt"
        with open(test_file, 'w') as f:
            f.write("This is not a video file")

        with open(test_file, 'rb') as f:
            files = {'file': ('invalid_file.txt', f, 'text/plain')}
            response = requests.post(
                f"{BASE_URL}/api/upload/video",
                headers=auth_headers,
                files=files,
                timeout=30
            )

        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json() if response.status_code != 200 else response.text}")

        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Error response should include 'detail'"
        assert "allowed" in data["detail"].lower() or "invalid" in data["detail"].lower(), \
            f"Error message should mention allowed file types: {data['detail']}"
        print(f"✓ Invalid file type correctly rejected: {data['detail']}")

    def test_05_original_file_deleted_after_conversion(self, auth_headers):
        """Test: Original non-MP4 files should be deleted after successful conversion"""
        # Upload a MOV file
        test_file = "/tmp/test_video_original.mov"
        
        with open(test_file, 'rb') as f:
            files = {'file': ('test_delete.mov', f, 'video/quicktime')}
            response = requests.post(
                f"{BASE_URL}/api/upload/video",
                headers=auth_headers,
                files=files,
                timeout=120
            )

        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # Verify conversion happened
        assert data.get("converted") == True, "File should have been converted"
        
        # The original .mov should be deleted - try to access it
        # Extract the base name and construct original URL
        mp4_filename = data["filename"]  # e.g., "uuid.mp4"
        base_name = mp4_filename.replace(".mp4", "")
        original_url = f"{BASE_URL}/api/uploads/videos/{base_name}.mov"
        
        print(f"Checking if original file deleted: {original_url}")
        original_response = requests.head(original_url, timeout=30)
        
        # Original should return 404 (deleted after conversion)
        assert original_response.status_code == 404, \
            f"Original .mov should be deleted (404), but got {original_response.status_code}"
        print(f"✓ Original file correctly deleted after conversion")

    def test_06_upload_without_auth_rejected(self):
        """Test: Upload without authentication should be rejected"""
        test_file = "/tmp/test_video.mp4"
        
        with open(test_file, 'rb') as f:
            files = {'file': ('test_noauth.mp4', f, 'video/mp4')}
            response = requests.post(
                f"{BASE_URL}/api/upload/video",
                files=files,  # No auth headers
                timeout=30
            )

        print(f"Response status: {response.status_code}")
        
        assert response.status_code in [401, 403], \
            f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print(f"✓ Unauthenticated upload correctly rejected: {response.status_code}")


class TestCourseFormFields:
    """Test that course creation form has all required fields"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with authorization"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_course_creation_with_all_fields(self, auth_headers):
        """Test: Course creation should accept all required fields"""
        course_data = {
            "title": "TEST_Video Upload Course",
            "description": "Course created for testing video upload feature",
            "category": "beginner",
            "video_url": "/api/uploads/videos/test.mp4",
            "thumbnail": "/api/uploads/images/test.jpg",
            "duration": "15 minutes",
            "is_free": True
        }
        
        response = requests.post(
            f"{BASE_URL}/api/courses",
            headers=auth_headers,
            json=course_data,
            timeout=30
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.json()}")
        
        assert response.status_code == 200, f"Course creation failed: {response.text}"
        data = response.json()
        
        # Verify all fields are saved
        assert data["title"] == course_data["title"]
        assert data["description"] == course_data["description"]
        assert data["category"] == course_data["category"]
        assert data["video_url"] == course_data["video_url"]
        assert data["thumbnail"] == course_data["thumbnail"]
        assert data["duration"] == course_data["duration"]
        assert data["is_free"] == course_data["is_free"]
        print(f"✓ Course created with all required fields")
        
        # Cleanup - delete test course
        course_id = data["id"]
        delete_response = requests.delete(
            f"{BASE_URL}/api/courses/{course_id}",
            headers=auth_headers
        )
        print(f"Cleanup - deleted test course: {delete_response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
