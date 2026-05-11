"""
Bunny.net integration service.

Provides:
  - BunnyStreamService: list/get videos in the Stream library, build embed URLs,
    sign embed tokens (SHA256(security_key + video_id + expires)).
  - BunnyStorageService: list/download/upload files in the Storage zone, used
    to serve the premium PDF via a backend-proxied signed endpoint so the
    raw storage URL is never exposed to the browser.

All Bunny API keys / passwords stay server-side. The frontend only ever
receives signed iframe URLs and binary file streams.
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import AsyncIterator, Optional

import httpx

logger = logging.getLogger(__name__)


class BunnyStreamService:
    BASE_URL = "https://video.bunnycdn.com"

    def __init__(
        self,
        library_id: int,
        api_key: str,
        cdn_hostname: str,
        token_auth_key: Optional[str] = None,
    ):
        self.library_id = library_id
        self.api_key = api_key
        self.cdn_hostname = cdn_hostname
        self.token_auth_key = token_auth_key or ""

    @property
    def _headers(self) -> dict:
        return {"AccessKey": self.api_key, "accept": "application/json"}

    async def list_videos(self, page: int = 1, items_per_page: int = 100) -> dict:
        url = f"{self.BASE_URL}/library/{self.library_id}/videos"
        params = {"page": page, "itemsPerPage": items_per_page, "orderBy": "date"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=self._headers, params=params)
            r.raise_for_status()
            return r.json()

    async def get_video(self, video_id: str) -> dict:
        url = f"{self.BASE_URL}/library/{self.library_id}/videos/{video_id}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=self._headers)
            r.raise_for_status()
            return r.json()

    def build_embed_url(
        self,
        video_id: str,
        autoplay: bool = False,
        expiration_minutes: int = 60,
    ) -> str:
        """Construct an iframe-ready embed URL.

        If `token_auth_key` is configured (i.e. Stream token authentication is
        enabled in the library security settings), the URL is signed:
            SHA256_HEX(token_security_key + video_id + expires)
        Otherwise, the unsigned embed URL is returned (relies on referrer
        allowlist for protection).
        """
        base = f"https://iframe.mediadelivery.net/embed/{self.library_id}/{video_id}"
        params: list[str] = []
        if autoplay:
            params.append("autoplay=true")
        if self.token_auth_key:
            expires = int(time.time()) + expiration_minutes * 60
            sig = hashlib.sha256(
                f"{self.token_auth_key}{video_id}{expires}".encode()
            ).hexdigest()
            params.append(f"token={sig}")
            params.append(f"expires={expires}")
        return f"{base}?{'&'.join(params)}" if params else base

    def build_thumbnail_url(self, video_id: str, thumbnail_filename: str = "thumbnail.jpg") -> str:
        return f"https://{self.cdn_hostname}/{video_id}/{thumbnail_filename}"


class BunnyStorageService:
    """Bunny Storage Edge API client. Region is part of the base URL.

    Default base URL is the global German endpoint. Pass a region prefix to
    target replicated zones (e.g. 'ny' -> https://ny.storage.bunnycdn.com).
    """

    def __init__(
        self,
        zone_name: str,
        password: str,
        region: Optional[str] = None,
    ):
        self.zone_name = zone_name
        self.password = password
        self.region = (region or "").strip().lower()
        prefix = f"{self.region}." if self.region else ""
        self.base_url = f"https://{prefix}storage.bunnycdn.com"

    @property
    def _headers(self) -> dict:
        return {"AccessKey": self.password, "accept": "*/*"}

    async def list_files(self, path: str = "") -> list:
        url = f"{self.base_url}/{self.zone_name}/{path}".rstrip("/") + "/"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(url, headers=self._headers)
            r.raise_for_status()
            return r.json()

    async def stream_file(self, path: str) -> AsyncIterator[bytes]:
        """Stream bytes from Bunny Storage to the caller (proxy use case)."""
        url = f"{self.base_url}/{self.zone_name}/{path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", url, headers=self._headers) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(64 * 1024):
                    yield chunk

    async def upload_bytes(self, path: str, content: bytes, content_type: str = "application/octet-stream") -> bool:
        url = f"{self.base_url}/{self.zone_name}/{path.lstrip('/')}"
        headers = {**self._headers, "Content-Type": content_type}
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.put(url, headers=headers, content=content)
            return r.status_code in (200, 201)

    async def delete(self, path: str) -> bool:
        url = f"{self.base_url}/{self.zone_name}/{path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.delete(url, headers=self._headers)
            return r.status_code in (200, 204)
