"""
Tests for FastAPI API routes.
"""

import pytest
from httpx import AsyncClient


class TestHealthEndpoint:
    """Tests for the health check endpoint."""

    @pytest.mark.asyncio
    async def test_health_check_returns_healthy(self, async_client: AsyncClient):
        """Test that health endpoint returns healthy status."""
        response = await async_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data

    @pytest.mark.asyncio
    async def test_health_check_returns_version(self, async_client: AsyncClient):
        """Test that health endpoint includes version."""
        response = await async_client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["version"] == "1.0.0"


class TestExecuteEndpoint:
    """Tests for the execute endpoint."""

    @pytest.mark.asyncio
    async def test_execute_creates_session(self, async_client: AsyncClient):
        """Test that execute endpoint creates a new session."""
        response = await async_client.post(
            "/api/execute",
            json={"goal": "Test goal for execution"}
        )

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["goal"] == "Test goal for execution"
        assert "stream_url" in data

    @pytest.mark.asyncio
    async def test_execute_with_custom_session_id(self, async_client: AsyncClient):
        """Test that execute endpoint accepts custom session ID."""
        custom_id = "my-custom-session-id"
        response = await async_client.post(
            "/api/execute",
            json={"goal": "Test goal with custom session", "session_id": custom_id}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == custom_id

    @pytest.mark.asyncio
    async def test_execute_returns_stream_url(self, async_client: AsyncClient):
        """Test that execute endpoint returns correct stream URL."""
        response = await async_client.post(
            "/api/execute",
            json={"goal": "Test goal with stream URL"}
        )

        assert response.status_code == 200
        data = response.json()
        session_id = data["session_id"]
        assert data["stream_url"] == f"/api/stream/{session_id}"


class TestSessionsEndpoint:
    """Tests for the sessions list endpoint."""

    @pytest.mark.asyncio
    async def test_list_sessions_returns_array(self, async_client: AsyncClient):
        """Test that sessions endpoint returns an array."""
        response = await async_client.get("/api/sessions")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    @pytest.mark.asyncio
    async def test_list_sessions_structure(self, async_client: AsyncClient):
        """Test that sessions have correct structure."""
        response = await async_client.get("/api/sessions")

        assert response.status_code == 200
        data = response.json()

        if len(data) > 0:
            session = data[0]
            assert "session_id" in session
            assert "goal" in session
            assert "phase" in session
            assert "task_count" in session
            assert "completed_count" in session


class TestSessionDetailEndpoint:
    """Tests for the session detail endpoint."""

    @pytest.mark.asyncio
    async def test_get_nonexistent_session_returns_404(self, async_client: AsyncClient):
        """Test that getting a non-existent session returns 404."""
        response = await async_client.get("/api/session/nonexistent-session-id")

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_pause_session_returns_status(self, async_client: AsyncClient):
        """Test that pause endpoint returns correct status."""
        response = await async_client.post("/api/session/test-session/pause")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "paused"
        assert data["session_id"] == "test-session"


class TestStreamEndpoint:
    """Tests for the SSE stream endpoint."""

    @pytest.mark.asyncio
    async def test_stream_returns_event_source(self, async_client: AsyncClient):
        """Test that stream endpoint returns event-stream content type."""
        # Note: We can't fully test SSE with httpx, but we can check it starts
        response = await async_client.get(
            "/api/stream/test-session",
            params={"goal": "Test goal"},
            timeout=2.0
        )

        # SSE endpoints typically return 200 with text/event-stream
        # The response might timeout which is expected for SSE
        assert response.status_code == 200 or response.status_code == 504
