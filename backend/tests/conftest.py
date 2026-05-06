"""Shared pytest fixtures for backend tests.

Motor's AsyncIOMotorClient is bound to the event loop active at import time.
Without a single shared loop across the test session, the second test would
fail with `RuntimeError: Event loop is closed`. We therefore use a
session-scoped event loop and configure pytest-asyncio accordingly.
"""
import asyncio

import pytest


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
