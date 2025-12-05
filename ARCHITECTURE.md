# Agent-Driven TODO Executor - Architecture Guide

## Project Overview

A full-stack AI agent application that takes high-level user goals, breaks them into actionable tasks, and executes them autonomously with real-time streaming updates.

**Tech Stack:**
- **Backend:** Python, FastAPI, LangGraph, LangChain, OpenAI GPT-4o-mini
- **Frontend:** Next.js 14, TypeScript, Zustand, Tailwind CSS
- **Persistence:** SQLite (AsyncSqliteSaver)
- **Streaming:** Server-Sent Events (SSE)

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │  ChatPanel  │  │   TaskList   │  │    ExecutionLog       │   │
│  │  (Messages) │  │   (Status)   │  │    (Traces)           │   │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬───────────┘   │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                    ┌─────▼─────┐                                │
│                    │  Zustand  │                                │
│                    │   Store   │                                │
│                    └─────┬─────┘                                │
│                          │                                      │
│                    ┌─────▼─────┐                                │
│                    │  useSSE   │  ◄── EventSource API           │
│                    │   Hook    │                                │
│                    └─────┬─────┘                                │
└──────────────────────────┼──────────────────────────────────────┘
                           │ SSE Connection
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    FastAPI Server                          │  │
│  │  POST /execute     GET /stream/{id}    GET /sessions       │  │
│  └────────────────────────────┬───────────────────────────────┘  │
│                               │                                  │
│  ┌────────────────────────────▼───────────────────────────────┐  │
│  │                    LangGraph Agent                         │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │              State Machine (6 Nodes)                │   │  │
│  │  │  analyze_goal → plan_todos → select_task            │   │  │
│  │  │                                  ↓                  │   │  │
│  │  │  complete ← reflect ← execute_task                  │   │  │
│  │  │      ↑           └──────→ (loop if more tasks)      │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────┬───────────────────────────────┘  │
│                               │                                  │
│  ┌────────────────────────────▼───────────────────────────────┐  │
│  │              AsyncSqliteSaver (Checkpointing)              │  │
│  │                    checkpoints.db                          │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## LangGraph State Machine

The agent is built as a **state machine** with 6 nodes that process and update a shared state object.

```
                    ┌─────────────────┐
                    │      START      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  analyze_goal   │  ← Validate & acknowledge goal
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   plan_todos    │  ← Generate 3-6 tasks (JSON)
                    └────────┬────────┘
                             │
                             ▼
               ┌────►┌─────────────────┐
               │     │  select_task    │  ← Pick first PENDING task
               │     └────────┬────────┘
               │              │
               │              ▼
               │     ┌─────────────────┐
               │     │  execute_task   │  ← LLM generates deliverable
               │     └────────┬────────┘
               │              │
               │              ▼
               │     ┌─────────────────┐
               │     │    reflect      │  ← Summarize progress
               │     └────────┬────────┘
               │              │
               │              ▼
               │     ┌─────────────────┐
               │     │ More pending?   │
               │     └────────┬────────┘
               │         │         │
               │        YES       NO
               │         │         │
               └─────────┘         ▼
                          ┌─────────────────┐
                          │    complete     │  ← Final summary
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │      END        │
                          └─────────────────┘
```

### Conditional Routing Logic

```python
# From graph.py - decides whether to continue or complete
def should_continue(state: AgentState) -> Literal["select_task", "complete"]:
    tasks = state.get("tasks", [])
    pending_tasks = [t for t in tasks if t["status"] == TaskStatus.PENDING.value]

    if pending_tasks:
        return "select_task"  # Loop back
    else:
        return "complete"     # Exit loop
```

---

## Agent State Definition

The state flows through all nodes and is persisted for resume capability.

```python
class AgentState(TypedDict):
    session_id: str                                    # Unique session ID
    messages: Annotated[Sequence[BaseMessage], add_messages]  # Chat history
    goal: str                                          # User's original goal
    tasks: Annotated[list[dict], tasks_reducer]        # TODO list
    current_task_index: int                            # Currently executing
    phase: str                                         # UI phase indicator
    traces: Annotated[list[dict], traces_reducer]      # Execution log
    is_paused: bool                                    # Pause/resume support
    error: Optional[str]                               # Error tracking
```

### Task Schema

```python
class Task(BaseModel):
    id: str               # UUID (8 chars)
    title: str            # "Write landing page headline"
    description: str      # "Create compelling headline for..."
    status: TaskStatus    # pending | in_progress | completed | failed
    result: Optional[str] # LLM-generated output
    error: Optional[str]  # Error message if failed
```

---

## SSE Streaming Flow

Real-time updates from backend to frontend using Server-Sent Events.

```
┌─────────────┐                           ┌─────────────┐
│   Browser   │                           │   FastAPI   │
└──────┬──────┘                           └──────┬──────┘
       │                                         │
       │  1. POST /execute {goal, session_id}    │
       │ ─────────────────────────────────────►  │
       │                                         │
       │  2. Response: {session_id}              │
       │ ◄─────────────────────────────────────  │
       │                                         │
       │  3. GET /stream/{session_id}            │
       │ ─────────────────────────────────────►  │
       │                                         │
       │  4. SSE: event: state_update            │
       │     data: {phase: "analyzing"}          │
       │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
       │                                         │
       │  5. SSE: event: tasks_update            │
       │     data: {tasks: [...]}                │
       │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
       │                                         │
       │  ... (more events) ...                  │
       │                                         │
       │  N. SSE: event: complete                │
       │     data: {status: "done"}              │
       │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
       │                                         │
```

### Backend SSE Implementation

```python
# routes.py - Streaming endpoint
@router.get("/stream/{session_id}")
async def stream_execution(session_id: str):
    async def event_generator():
        queue = asyncio.Queue()
        execution_queues[session_id] = queue

        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"

                if event["type"] == "complete":
                    break
        except asyncio.TimeoutError:
            yield f"event: heartbeat\ndata: {{}}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )
```

### Frontend SSE Hook

```typescript
// useSSE.ts - Connection management
export function useSSE(sessionId: string) {
  useEffect(() => {
    const eventSource = new EventSource(`/api/stream/${sessionId}`);

    eventSource.addEventListener('state_update', (e) => {
      const data = JSON.parse(e.data);
      store.setPhase(data.phase);
    });

    eventSource.addEventListener('tasks_update', (e) => {
      const data = JSON.parse(e.data);
      store.setTasks(data.tasks);
    });

    return () => eventSource.close();
  }, [sessionId]);
}
```

---

## Data Flow Example

**User Goal:** "Create a landing page for my fitness app"

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                   │
│    "Create a landing page for my fitness app"                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ANALYZE_GOAL                                                 │
│    LLM: "I'll help you create a landing page. Let me break     │
│          this into specific tasks..."                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PLAN_TODOS                                                   │
│    LLM generates structured JSON:                               │
│    {                                                            │
│      "tasks": [                                                 │
│        {"title": "Write headline", "description": "..."},       │
│        {"title": "Create hero section", "description": "..."},  │
│        {"title": "Add feature list", "description": "..."},     │
│        {"title": "Design CTA button", "description": "..."}     │
│      ]                                                          │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. EXECUTION LOOP (for each task)                               │
│                                                                 │
│    SELECT_TASK → EXECUTE_TASK → REFLECT                         │
│                                                                 │
│    Task 1: "Write headline"                                     │
│    Result: "Transform Your Body, Transform Your Life"           │
│                                                                 │
│    Task 2: "Create hero section"                                │
│    Result: <div class="hero">...</div>                          │
│                                                                 │
│    ... continues until all tasks complete ...                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. COMPLETE                                                     │
│    Summary: "✅ 4/4 tasks completed successfully"                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Agent Framework | LangGraph | AutoGen, CrewAI, raw LangChain | Built-in checkpointing, graph-based control flow, streaming support |
| Streaming | SSE | WebSocket, Long Polling | Simpler (unidirectional), auto-reconnect, HTTP/1.1 compatible |
| Persistence | SQLite | PostgreSQL, Redis | Zero-config, LangGraph native AsyncSqliteSaver |
| Frontend State | Zustand | Redux, Context API | Lightweight, TypeScript-first, minimal boilerplate |
| LLM | GPT-4o-mini | GPT-4, Claude | Cost-efficient ($0.15/1M tokens), fast, reliable |

---

## Checkpointing & Resume

The agent supports pause/resume via LangGraph's checkpointing system.

```python
# Creating agent with persistence
async def create_agent(db_path: str = "checkpoints.db"):
    conn = await aiosqlite.connect(db_path)
    checkpointer = AsyncSqliteSaver(conn)

    return TodoExecutorGraph(
        llm=ChatOpenAI(model="gpt-4o-mini"),
        checkpointer=checkpointer
    )

# Resume from checkpoint
async def resume(session_id: str):
    config = {"configurable": {"thread_id": session_id}}
    state = await compiled.aget_state(config)

    async for event in compiled.astream(
        {"is_paused": False},  # Resume execution
        config,
        stream_mode="updates"
    ):
        yield event
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/execute` | Start new execution with goal |
| GET | `/stream/{session_id}` | SSE stream for real-time updates |
| POST | `/pause/{session_id}` | Pause execution |
| POST | `/resume/{session_id}` | Resume paused execution |
| GET | `/sessions` | List all saved sessions |
| GET | `/session/{session_id}` | Get session state |

---

## Frontend Components

```
src/
├── app/
│   └── page.tsx              # Main page layout
├── components/
│   ├── ChatPanel.tsx         # Message display & input
│   ├── TaskList.tsx          # Task cards with status
│   ├── ExecutionLog.tsx      # Terminal-style trace log
│   └── ControlPanel.tsx      # Start/Pause/Resume buttons
├── hooks/
│   └── useSSE.ts             # SSE connection management
└── store/
    └── executorStore.ts      # Zustand global state
```

---

## Running the Application

```bash
# Backend (Terminal 1)
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (Terminal 2)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

---

## Future Improvements

1. **Parallel Execution** - Execute independent tasks concurrently
2. **Task Dependencies** - DAG-based task ordering
3. **Real Tools** - Web search, code execution, file operations
4. **Better Error Recovery** - Exponential backoff, retry logic
5. **PostgreSQL** - For production horizontal scaling
6. **Redis Caching** - Session state and LLM response caching
7. **Authentication** - Clerk JWT integration (frontend prepared)

---

## Architecture Pattern: Plan-and-Execute

This project implements the **Plan-and-Execute** agent pattern:

```
┌────────────────────────────────────────────────────────────┐
│                    PLAN-AND-EXECUTE                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   ┌──────────────────────────────────────────────────┐     │
│   │              PLANNING PHASE                      │     │
│   │  • User provides high-level goal                 │     │
│   │  • LLM breaks down into structured tasks         │     │
│   │  • Tasks stored in state                         │     │
│   └──────────────────────────────────────────────────┘     │
│                          │                                 │
│                          ▼                                 │
│   ┌──────────────────────────────────────────────────┐     │
│   │             EXECUTION PHASE                      │     │
│   │  • Loop through tasks sequentially               │     │
│   │  • LLM executes each task                        │     │
│   │  • Reflect after each task                       │     │
│   │  • Update state with results                     │     │
│   └──────────────────────────────────────────────────┘     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**vs. ReAct Pattern:**
- ReAct: Interleaved thinking and acting (Thought → Action → Observation)
- Plan-and-Execute: Upfront planning, then execution (Plan → Execute All)

This project uses Plan-and-Execute because tasks are independent and benefit from upfront structured planning.

---

*Built by Darshan T M for Libra Technical Assessment*
