"""
LangGraph Definition for the TODO Executor Agent.

This module defines the state machine that orchestrates:
1. Goal analysis
2. Task planning (with Tree of Thoughts)
3. Task execution loop
4. Reflection and completion

Key Features:
- Checkpointing for persistence/resume
- Human-in-the-loop (pause/resume)
- Streaming events via callbacks
"""

from typing import Literal, Callable, Any
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langchain_openai import ChatOpenAI

from .state import AgentState, ExecutionPhase, TaskStatus
from .nodes import AgentNodes


def should_continue(state: AgentState) -> Literal["select_task", "complete"]:
    """
    Router: Decide whether to continue executing or complete.
    Called after reflection to check if more tasks remain.
    """
    tasks = state.get("tasks", [])

    # Check if any tasks are still pending
    pending_tasks = [t for t in tasks if t["status"] == TaskStatus.PENDING.value]

    if pending_tasks:
        return "select_task"
    else:
        return "complete"


def check_pause(state: AgentState) -> Literal["execute_task", "paused"]:
    """
    Router: Check if execution should pause for human intervention.
    """
    if state.get("is_paused", False):
        return "paused"
    return "execute_task"


class TodoExecutorGraph:
    """
    The main agent graph for TODO execution.

    Architecture:
    ```
    START
      │
      ▼
    analyze_goal
      │
      ▼
    plan_todos
      │
      ▼
    select_task ◄────────────┐
      │                      │
      ▼                      │
    execute_task             │
      │                      │
      ▼                      │
    reflect ─────────────────┘
      │                (if more tasks)
      ▼
    complete
      │
      ▼
     END
    ```
    """

    def __init__(
        self,
        llm: ChatOpenAI,
        checkpointer: AsyncSqliteSaver = None,
        on_event: Callable[[str, Any], None] = None
    ):
        self.llm = llm
        self.checkpointer = checkpointer
        self.on_event = on_event or (lambda *args: None)
        self.nodes = AgentNodes(llm)
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """Construct the LangGraph state machine."""

        # Create the graph with our state schema
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("analyze_goal", self._wrap_node(self.nodes.analyze_goal))
        workflow.add_node("plan_todos", self._wrap_node(self.nodes.plan_todos))
        workflow.add_node("select_task", self._wrap_node(self.nodes.select_task))
        workflow.add_node("execute_task", self._wrap_node(self.nodes.execute_task))
        workflow.add_node("reflect", self._wrap_node(self.nodes.reflect))
        workflow.add_node("complete", self._wrap_node(self.nodes.complete))

        # Define edges
        workflow.add_edge(START, "analyze_goal")
        workflow.add_edge("analyze_goal", "plan_todos")
        workflow.add_edge("plan_todos", "select_task")

        # Conditional: check if paused before executing
        workflow.add_edge("select_task", "execute_task")
        workflow.add_edge("execute_task", "reflect")

        # Conditional: continue or complete
        workflow.add_conditional_edges(
            "reflect",
            should_continue,
            {
                "select_task": "select_task",
                "complete": "complete"
            }
        )

        workflow.add_edge("complete", END)

        return workflow

    def _wrap_node(self, node_fn):
        """
        Wrap a node function to emit events for real-time streaming.
        This enables the AG-UI protocol pattern.
        """
        async def wrapped(state: AgentState) -> dict:
            # Emit node start event
            node_name = node_fn.__name__
            self.on_event("node_start", {"node": node_name})

            # Execute the node
            result = await node_fn(state)

            # Emit node end event with state updates
            self.on_event("node_end", {
                "node": node_name,
                "updates": result
            })

            return result

        # Preserve function name for debugging
        wrapped.__name__ = node_fn.__name__
        return wrapped

    def compile(self):
        """Compile the graph with optional checkpointing."""
        if self.checkpointer:
            return self.graph.compile(checkpointer=self.checkpointer)
        return self.graph.compile()

    async def run(
        self,
        session_id: str,
        goal: str,
        stream: bool = True
    ):
        """
        Execute the agent for a given goal.

        Args:
            session_id: Unique session identifier for checkpointing
            goal: The user's high-level goal
            stream: Whether to stream intermediate states

        Yields:
            State updates as the agent progresses
        """
        compiled = self.compile()

        initial_state = {
            "session_id": session_id,
            "goal": goal,
            "messages": [],
            "tasks": [],
            "current_task_index": -1,
            "phase": ExecutionPhase.IDLE.value,
            "traces": [],
            "is_paused": False,
            "error": None
        }

        config = {"configurable": {"thread_id": session_id}}

        if stream:
            async for event in compiled.astream(
                initial_state,
                config,
                stream_mode="updates"
            ):
                yield event
        else:
            result = await compiled.ainvoke(initial_state, config)
            yield result

    async def resume(self, session_id: str, user_input: str = None):
        """
        Resume execution from a checkpoint with optional human input.

        This supports human-in-the-loop workflows where users can provide
        additional context or instructions when resuming a paused session.

        Args:
            session_id: The session to resume
            user_input: Optional user input to provide context for the next task

        Yields:
            State updates as the agent continues
        """
        compiled = self.compile()
        config = {"configurable": {"thread_id": session_id}}

        # Get current state
        state = await compiled.aget_state(config)

        if state and state.values:
            # Build update with user input if provided
            update = {"is_paused": False}
            if user_input:
                # Add user input to messages for context
                current_messages = state.values.get("messages", [])
                from langchain_core.messages import HumanMessage
                new_message = HumanMessage(content=user_input)
                update["messages"] = current_messages + [new_message]
                update["human_input"] = user_input  # Store for task execution

            # Continue execution with updates
            async for event in compiled.astream(
                update,
                config,
                stream_mode="updates"
            ):
                yield event

    async def get_state(self, session_id: str) -> AgentState:
        """Get the current state for a session."""
        compiled = self.compile()
        config = {"configurable": {"thread_id": session_id}}
        state = await compiled.aget_state(config)
        return state.values if state else None

    async def list_sessions(self) -> list[dict]:
        """List all available sessions from the checkpointer."""
        if not self.checkpointer:
            return []

        sessions = []
        try:
            # Query unique thread_ids from the checkpoints table
            async with self.checkpointer.conn.execute(
                "SELECT DISTINCT thread_id FROM checkpoints ORDER BY thread_id DESC LIMIT 50"
            ) as cursor:
                rows = await cursor.fetchall()
                for row in rows:
                    session_id = row[0]
                    state = await self.get_state(session_id)
                    if state:
                        sessions.append({
                            "session_id": session_id,
                            "goal": state.get("goal", ""),
                            "phase": state.get("phase", "unknown"),
                            "task_count": len(state.get("tasks", [])),
                            "completed_count": len([t for t in state.get("tasks", []) if t.get("status") == "completed"])
                        })
        except Exception as e:
            print(f"Error listing sessions: {e}")

        return sessions


async def create_agent(
    openai_api_key: str,
    model: str = "gpt-4.1-mini",
    db_path: str = "checkpoints.db",
    on_event: Callable = None
) -> TodoExecutorGraph:
    """
    Factory function to create a configured agent.

    Args:
        openai_api_key: OpenAI API key
        model: Model to use (default: gpt-4o-mini for cost efficiency)
        db_path: Path for SQLite checkpoint database
        on_event: Callback for real-time event streaming
    """
    llm = ChatOpenAI(
        api_key=openai_api_key,
        model=model,
        temperature=0.7
    )

    # For newer langgraph versions, we need to use the async context manager
    # but we'll create a simpler version without persistence for now
    # to avoid the async context manager complexity
    import aiosqlite
    conn = await aiosqlite.connect(db_path)
    checkpointer = AsyncSqliteSaver(conn)

    return TodoExecutorGraph(
        llm=llm,
        checkpointer=checkpointer,
        on_event=on_event
    )
