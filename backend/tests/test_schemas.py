"""
Tests for Pydantic schemas.
"""

import pytest
from pydantic import ValidationError
from app.api.schemas import (
    StartExecutionRequest,
    SessionResponse,
    SessionListItem,
    HealthResponse,
    TaskResponse,
    TraceResponse,
)


class TestStartExecutionRequest:
    """Tests for StartExecutionRequest schema."""

    def test_valid_request_with_goal(self):
        """Test creating valid request with goal."""
        request = StartExecutionRequest(goal="Create a landing page for the company")

        assert request.goal == "Create a landing page for the company"
        assert request.session_id is None

    def test_valid_request_with_session_id(self):
        """Test creating valid request with custom session_id."""
        request = StartExecutionRequest(
            goal="Create a landing page for testing",
            session_id="custom-session-123"
        )

        assert request.goal == "Create a landing page for testing"
        assert request.session_id == "custom-session-123"

    def test_goal_is_required(self):
        """Test that goal is required."""
        with pytest.raises(ValidationError):
            StartExecutionRequest()

    def test_short_goal_is_invalid(self):
        """Test that short goal is invalid (min 10 chars)."""
        with pytest.raises(ValidationError):
            StartExecutionRequest(goal="short")


class TestTaskResponse:
    """Tests for TaskResponse schema."""

    def test_valid_task(self):
        """Test creating valid task."""
        task = TaskResponse(
            id="task-1",
            title="Research topic",
            description="Research the main topic",
            status="pending"
        )

        assert task.id == "task-1"
        assert task.title == "Research topic"
        assert task.status == "pending"

    def test_task_with_result(self):
        """Test task with result."""
        task = TaskResponse(
            id="task-1",
            title="Research topic",
            description="Research the main topic",
            status="completed",
            result="Completed research output"
        )

        assert task.result == "Completed research output"

    def test_task_with_error(self):
        """Test task with error."""
        task = TaskResponse(
            id="task-1",
            title="Research topic",
            description="Research the main topic",
            status="failed",
            error="Task execution failed"
        )

        assert task.error == "Task execution failed"

    def test_task_optional_fields_default_none(self):
        """Test that optional fields default to None."""
        task = TaskResponse(
            id="task-1",
            title="Research topic",
            description="Research the main topic",
            status="pending"
        )

        assert task.result is None
        assert task.error is None
        assert task.started_at is None
        assert task.completed_at is None


class TestTraceResponse:
    """Tests for TraceResponse schema."""

    def test_valid_trace(self):
        """Test creating valid trace."""
        trace = TraceResponse(
            timestamp="2024-01-01T10:00:00",
            node="analyze_goal",
            action="analyzing",
            message="Analyzing goal..."
        )

        assert trace.node == "analyze_goal"
        assert trace.action == "analyzing"

    def test_trace_with_task_id(self):
        """Test trace with task_id."""
        trace = TraceResponse(
            timestamp="2024-01-01T10:00:00",
            node="execute_task",
            action="execution_started",
            task_id="task-1",
            message="Starting task execution"
        )

        assert trace.task_id == "task-1"

    def test_trace_with_details(self):
        """Test trace with details."""
        trace = TraceResponse(
            timestamp="2024-01-01T10:00:00",
            node="reflect",
            action="reflection",
            message="Reflection on progress",
            details={"completed": 3, "total": 5}
        )

        assert trace.details["completed"] == 3
        assert trace.details["total"] == 5


class TestSessionResponse:
    """Tests for SessionResponse schema."""

    def test_valid_session_response(self):
        """Test creating valid session response."""
        response = SessionResponse(
            session_id="session-123",
            goal="Create a document",
            phase="executing",
            tasks=[],
            traces=[],
            is_paused=False
        )

        assert response.session_id == "session-123"
        assert response.phase == "executing"
        assert response.is_paused is False

    def test_session_with_tasks(self):
        """Test session response with tasks."""
        task = TaskResponse(
            id="task-1",
            title="Research",
            description="Research topic",
            status="pending"
        )
        response = SessionResponse(
            session_id="session-123",
            goal="Create a document",
            phase="executing",
            tasks=[task],
            traces=[],
            is_paused=False
        )

        assert len(response.tasks) == 1
        assert response.tasks[0].id == "task-1"

    def test_session_with_error(self):
        """Test session response with error."""
        response = SessionResponse(
            session_id="session-123",
            goal="Create a document",
            phase="error",
            tasks=[],
            traces=[],
            is_paused=False,
            error="Something went wrong"
        )

        assert response.error == "Something went wrong"


class TestSessionListItem:
    """Tests for SessionListItem schema."""

    def test_valid_list_item(self):
        """Test creating valid session list item."""
        item = SessionListItem(
            session_id="session-123",
            goal="Create a document",
            phase="completed",
            task_count=5,
            completed_count=5
        )

        assert item.session_id == "session-123"
        assert item.task_count == 5
        assert item.completed_count == 5

    def test_list_item_partial_completion(self):
        """Test session list item with partial completion."""
        item = SessionListItem(
            session_id="session-123",
            goal="Create a document",
            phase="executing",
            task_count=5,
            completed_count=3
        )

        assert item.completed_count < item.task_count

    def test_list_item_optional_created_at(self):
        """Test that created_at is optional."""
        item = SessionListItem(
            session_id="session-123",
            goal="Create a document",
            phase="completed",
            task_count=5,
            completed_count=5
        )

        assert item.created_at is None


class TestHealthResponse:
    """Tests for HealthResponse schema."""

    def test_default_health_response(self):
        """Test default health response."""
        response = HealthResponse()

        assert response.status == "healthy"
        assert response.version == "1.0.0"

    def test_custom_health_response(self):
        """Test custom health response."""
        response = HealthResponse(
            status="degraded",
            version="2.0.0"
        )

        assert response.status == "degraded"
        assert response.version == "2.0.0"
