"""
FastAPI Routes for the TODO Executor API.

Features:
- SSE streaming for real-time updates (AG-UI protocol)
- Session management with persistence
- Human-in-the-loop control (pause/resume)
"""

import asyncio
import json
import uuid
from datetime import datetime
from typing import AsyncGenerator


class DateTimeEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles datetime objects."""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from .schemas import (
    StartExecutionRequest,
    PauseResumeRequest,
    SessionResponse,
    SessionListItem,
    HealthResponse,
)
from ..agent import create_agent, TaskStatus
from ..core.config import get_settings, Settings

router = APIRouter()

# Global agent instance (initialized lazily on first request)
# Reset by restarting server or modifying this file
_agent = None
_event_queues: dict[str, asyncio.Queue] = {}
_agent_initialized = False


async def get_agent():
    """Dependency to get the agent instance."""
    global _agent
    if _agent is None:
        settings = get_settings()
        _agent = await create_agent(
            openai_api_key=settings.openai_api_key,
            model=settings.openai_model,
            db_path="checkpoints.db",
            on_event=broadcast_event
        )
    return _agent


def broadcast_event(event_type: str, data: dict):
    """Broadcast an event to all connected SSE clients for this session."""
    session_id = data.get("session_id")
    if session_id and session_id in _event_queues:
        try:
            _event_queues[session_id].put_nowait({
                "event": event_type,
                "data": data,
                "timestamp": datetime.utcnow().isoformat()
            })
        except asyncio.QueueFull:
            pass  # Drop event if queue is full


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse()


@router.post("/execute")
async def start_execution(
    request: StartExecutionRequest,
    agent=Depends(get_agent)
):
    """
    Start a new execution session.

    Returns the session_id to use for SSE streaming.
    """
    session_id = request.session_id or str(uuid.uuid4())

    # Initialize event queue for this session
    _event_queues[session_id] = asyncio.Queue(maxsize=100)

    return {
        "session_id": session_id,
        "goal": request.goal,
        "stream_url": f"/api/stream/{session_id}"
    }


@router.get("/stream/{session_id}")
async def stream_execution(
    session_id: str,
    goal: str = None,
    agent=Depends(get_agent)
):
    """
    SSE endpoint for real-time execution updates.

    Follows the AG-UI protocol pattern:
    - Events are streamed as they occur
    - State updates use JSON Patch format where applicable
    - Client can reconnect and resume

    Event types:
    - node_start: Graph node started
    - node_end: Graph node completed
    - state_update: Full state snapshot
    - task_update: Individual task changed
    - phase_change: Execution phase changed
    - trace: New trace entry
    - complete: Execution finished
    - error: Error occurred
    """

    async def event_generator() -> AsyncGenerator[dict, None]:
        """Generate SSE events from agent execution."""

        # Create queue for this session if not exists
        if session_id not in _event_queues:
            _event_queues[session_id] = asyncio.Queue(maxsize=100)

        queue = _event_queues[session_id]

        try:
            # Send initial connection event
            yield {
                "event": "connected",
                "data": json.dumps({
                    "session_id": session_id,
                    "timestamp": datetime.utcnow().isoformat()
                })
            }

            # Start agent execution in background if goal provided
            if goal:
                asyncio.create_task(run_agent(session_id, goal, agent, queue))

            # Stream events from queue
            while True:
                try:
                    # Wait for events with timeout
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)

                    yield {
                        "event": event["event"],
                        "data": json.dumps(event["data"], cls=DateTimeEncoder)
                    }

                    # Check if execution is complete
                    if event["event"] in ("complete", "error"):
                        break

                except asyncio.TimeoutError:
                    # Send keepalive ping
                    yield {
                        "event": "ping",
                        "data": json.dumps({"timestamp": datetime.utcnow().isoformat()})
                    }

        finally:
            # Cleanup queue when client disconnects
            if session_id in _event_queues:
                del _event_queues[session_id]

    return EventSourceResponse(event_generator())


async def run_agent(session_id: str, goal: str, agent, queue: asyncio.Queue):
    """Run the agent and push events to the queue."""
    try:
        # Send phase change event
        await queue.put({
            "event": "phase_change",
            "data": {"phase": "analyzing", "session_id": session_id}
        })

        async for update in agent.run(session_id, goal):
            # Process each state update from the agent
            for node_name, node_output in update.items():
                # Send node completion event
                await queue.put({
                    "event": "node_end",
                    "data": {
                        "node": node_name,
                        "session_id": session_id
                    }
                })

                # Send specific updates based on what changed
                if "tasks" in node_output:
                    await queue.put({
                        "event": "tasks_update",
                        "data": {
                            "tasks": node_output["tasks"],
                            "session_id": session_id
                        }
                    })

                if "phase" in node_output:
                    await queue.put({
                        "event": "phase_change",
                        "data": {
                            "phase": node_output["phase"],
                            "session_id": session_id
                        }
                    })

                if "traces" in node_output:
                    for trace in node_output["traces"]:
                        await queue.put({
                            "event": "trace",
                            "data": {
                                "trace": trace,
                                "session_id": session_id
                            }
                        })

                if "messages" in node_output:
                    for msg in node_output["messages"]:
                        await queue.put({
                            "event": "message",
                            "data": {
                                "role": "assistant",
                                "content": msg.content,
                                "session_id": session_id
                            }
                        })

        # Send completion event
        await queue.put({
            "event": "complete",
            "data": {"session_id": session_id}
        })

    except Exception as e:
        await queue.put({
            "event": "error",
            "data": {
                "error": str(e),
                "session_id": session_id
            }
        })


@router.get("/sessions", response_model=list[SessionListItem])
async def list_sessions(agent=Depends(get_agent)):
    """List all available sessions for resume."""
    sessions = await agent.list_sessions()
    return [
        SessionListItem(
            session_id=s["session_id"],
            goal=s["goal"],
            phase=s["phase"],
            task_count=s["task_count"],
            completed_count=s["completed_count"]
        )
        for s in sessions
    ]


@router.get("/session/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, agent=Depends(get_agent)):
    """Get the current state of a session."""
    state = await agent.get_state(session_id)

    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse(
        session_id=state["session_id"],
        goal=state["goal"],
        phase=state["phase"],
        tasks=state["tasks"],
        traces=state["traces"],
        is_paused=state["is_paused"],
        error=state.get("error")
    )


@router.post("/session/{session_id}/pause")
async def pause_session(session_id: str, agent=Depends(get_agent)):
    """Pause execution of a session."""
    # In a full implementation, this would set is_paused=True
    # and the agent would check this before each task
    return {"status": "paused", "session_id": session_id}


@router.get("/session/{session_id}/resume")
async def resume_session_stream(
    session_id: str,
    user_input: str = None,
    agent=Depends(get_agent)
):
    """
    SSE endpoint to resume execution of a session with pending tasks.

    Supports human-in-the-loop by accepting optional user_input parameter
    that will be passed to the next task execution for context.

    This streams the continued execution like the main stream endpoint.
    """
    async def event_generator() -> AsyncGenerator[dict, None]:
        # Create queue for this session
        if session_id not in _event_queues:
            _event_queues[session_id] = asyncio.Queue(maxsize=100)

        queue = _event_queues[session_id]

        try:
            # Send initial connection event
            yield {
                "event": "connected",
                "data": json.dumps({
                    "session_id": session_id,
                    "resuming": True,
                    "timestamp": datetime.utcnow().isoformat()
                })
            }

            # Start resume in background with optional user input
            asyncio.create_task(resume_agent(session_id, agent, queue, user_input))

            # Stream events from queue
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)

                    yield {
                        "event": event["event"],
                        "data": json.dumps(event["data"], cls=DateTimeEncoder)
                    }

                    if event["event"] in ("complete", "error"):
                        break

                except asyncio.TimeoutError:
                    yield {
                        "event": "ping",
                        "data": json.dumps({"timestamp": datetime.utcnow().isoformat()})
                    }

        finally:
            if session_id in _event_queues:
                del _event_queues[session_id]

    return EventSourceResponse(event_generator())


async def resume_agent(session_id: str, agent, queue: asyncio.Queue, user_input: str = None):
    """Resume agent execution from checkpoint with optional user input."""
    try:
        # Send phase change
        await queue.put({
            "event": "phase_change",
            "data": {"phase": "executing", "session_id": session_id}
        })

        # If user provided input, add it as a message
        if user_input:
            await queue.put({
                "event": "message",
                "data": {
                    "role": "user",
                    "content": user_input,
                    "session_id": session_id
                }
            })

        async for update in agent.resume(session_id, user_input=user_input):
            for node_name, node_output in update.items():
                await queue.put({
                    "event": "node_end",
                    "data": {"node": node_name, "session_id": session_id}
                })

                if "tasks" in node_output:
                    await queue.put({
                        "event": "tasks_update",
                        "data": {"tasks": node_output["tasks"], "session_id": session_id}
                    })

                if "phase" in node_output:
                    await queue.put({
                        "event": "phase_change",
                        "data": {"phase": node_output["phase"], "session_id": session_id}
                    })

                if "traces" in node_output:
                    for trace in node_output["traces"]:
                        await queue.put({
                            "event": "trace",
                            "data": {"trace": trace, "session_id": session_id}
                        })

                if "messages" in node_output:
                    for msg in node_output["messages"]:
                        await queue.put({
                            "event": "message",
                            "data": {"role": "assistant", "content": msg.content, "session_id": session_id}
                        })

        await queue.put({
            "event": "complete",
            "data": {"session_id": session_id}
        })
    except Exception as e:
        await queue.put({
            "event": "error",
            "data": {"error": str(e), "session_id": session_id}
        })
