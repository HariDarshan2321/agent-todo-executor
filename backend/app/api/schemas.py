"""
Pydantic schemas for API request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime


# ============ Request Schemas ============

class StartExecutionRequest(BaseModel):
    """Request to start a new execution session."""
    goal: str = Field(..., min_length=10, max_length=1000, description="The high-level goal to accomplish")
    session_id: Optional[str] = Field(None, description="Optional session ID for resuming")


class PauseResumeRequest(BaseModel):
    """Request to pause or resume execution."""
    session_id: str
    action: Literal["pause", "resume"]


# ============ Response Schemas ============

class TaskResponse(BaseModel):
    """A single task in the TODO list."""
    id: str
    title: str
    description: str
    status: str
    result: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class TraceResponse(BaseModel):
    """A single execution trace entry."""
    timestamp: datetime
    node: str
    action: str
    task_id: Optional[str] = None
    message: str
    details: Optional[dict] = None


class SessionResponse(BaseModel):
    """Current session state."""
    session_id: str
    goal: str
    phase: str
    tasks: list[TaskResponse]
    traces: list[TraceResponse]
    is_paused: bool
    error: Optional[str] = None


class SessionListItem(BaseModel):
    """Summary of a session for listing."""
    session_id: str
    goal: str
    phase: str
    task_count: int
    completed_count: int
    created_at: Optional[datetime] = None


# ============ SSE Event Schemas ============

class SSEEvent(BaseModel):
    """
    Server-Sent Event following AG-UI protocol.

    Event types:
    - node_start: A graph node started executing
    - node_end: A graph node finished
    - state_update: State changed (JSON Patch)
    - task_update: A specific task was updated
    - phase_change: Execution phase changed
    - trace: New trace entry added
    - complete: Execution finished
    - error: An error occurred
    """
    event: str
    data: dict
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str = "1.0.0"
