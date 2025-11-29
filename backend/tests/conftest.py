"""
Pytest configuration and fixtures for backend tests.
"""

import asyncio
import os
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch

# Set test environment variables before importing app
os.environ["OPENAI_API_KEY"] = "test-api-key-for-testing"
os.environ["OPENAI_MODEL"] = "gpt-4o-mini"

from app.main import app
from app.agent import TaskStatus


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def async_client():
    """Create async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
def mock_llm():
    """Mock LLM for testing without actual API calls."""
    mock = AsyncMock()
    mock.ainvoke.return_value = MagicMock(
        content="Test response from mocked LLM"
    )
    return mock


@pytest.fixture
def sample_tasks():
    """Sample task data for testing."""
    return [
        {
            "id": "task-1",
            "title": "Research topic",
            "description": "Research the main topic",
            "status": TaskStatus.PENDING.value,
            "result": None,
            "error": None,
        },
        {
            "id": "task-2",
            "title": "Write content",
            "description": "Write the main content",
            "status": TaskStatus.PENDING.value,
            "result": None,
            "error": None,
        },
        {
            "id": "task-3",
            "title": "Review and finalize",
            "description": "Review and finalize the output",
            "status": TaskStatus.PENDING.value,
            "result": None,
            "error": None,
        },
    ]


@pytest.fixture
def sample_state(sample_tasks):
    """Sample agent state for testing."""
    return {
        "session_id": "test-session-123",
        "goal": "Create a test document",
        "phase": "idle",
        "tasks": sample_tasks,
        "traces": [],
        "messages": [],
        "current_task_index": -1,
        "is_paused": False,
        "error": None,
    }
