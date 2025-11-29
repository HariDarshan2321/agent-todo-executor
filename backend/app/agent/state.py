"""
LangGraph State Definition.
Strongly typed state with clear semantics for the TODO executor agent.
"""

from typing import Annotated, Literal, Optional, Sequence
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel
from datetime import datetime
from enum import Enum
import uuid


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    NEEDS_FOLLOWUP = "needs_followup"


class Task(BaseModel):
    """A single TODO task."""
    id: str
    title: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @classmethod
    def create(cls, title: str, description: str) -> "Task":
        """Factory method to create a new task."""
        return cls(
            id=str(uuid.uuid4())[:8],
            title=title,
            description=description
        )


class TraceEntry(BaseModel):
    """A single execution trace entry for transparency."""
    timestamp: datetime
    node: str  # Which graph node generated this
    action: str  # What action was taken
    task_id: Optional[str] = None
    message: str
    details: Optional[dict] = None


class ExecutionPhase(str, Enum):
    """Current phase of the agent execution."""
    IDLE = "idle"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    EXECUTING = "executing"
    REFLECTING = "reflecting"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"


# Custom reducer for tasks - allows targeted updates
def tasks_reducer(existing: list[dict], new: list[dict]) -> list[dict]:
    """
    Smart merge for tasks list.
    If new has same ID, update. Otherwise append.
    """
    if not existing:
        return new
    if not new:
        return existing

    existing_map = {t["id"]: t for t in existing}
    for task in new:
        existing_map[task["id"]] = task
    return list(existing_map.values())


# Custom reducer for traces - always append
def traces_reducer(existing: list[dict], new: list[dict]) -> list[dict]:
    """Append new traces to existing."""
    return (existing or []) + (new or [])


class AgentState(TypedDict):
    """
    Complete state for the TODO Executor Agent.

    This state flows through the LangGraph and is persisted
    via checkpointing for resume capability.
    """

    # Session identification
    session_id: str

    # Chat messages (uses built-in add_messages reducer)
    messages: Annotated[Sequence[BaseMessage], add_messages]

    # User's high-level goal
    goal: str

    # Structured TODO list
    tasks: Annotated[list[dict], tasks_reducer]

    # Current task index being executed
    current_task_index: int

    # Execution phase for UI visualization
    phase: str  # ExecutionPhase value

    # Execution traces for transparency
    traces: Annotated[list[dict], traces_reducer]

    # Human-in-the-loop: is execution paused?
    is_paused: bool

    # Error tracking
    error: Optional[str]


def create_initial_state(session_id: str, goal: str = "") -> AgentState:
    """Create a fresh initial state for a new session."""
    return AgentState(
        session_id=session_id,
        messages=[],
        goal=goal,
        tasks=[],
        current_task_index=-1,
        phase=ExecutionPhase.IDLE.value,
        traces=[],
        is_paused=False,
        error=None
    )
