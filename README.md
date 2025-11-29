# TODO Executor Agent

> An AI-powered task execution system with real-time streaming, built for the Libra Tech AI Senior Full Stack Engineer assessment.

![Architecture](https://img.shields.io/badge/Architecture-LangGraph-blue)
![Frontend](https://img.shields.io/badge/Frontend-Next.js%2014-black)
![Backend](https://img.shields.io/badge/Backend-FastAPI-green)
![Streaming](https://img.shields.io/badge/Streaming-SSE-orange)

## Overview

This project demonstrates a modern AI agent architecture that:
1. **Engages** with users about high-level goals via chat
2. **Plans** structured TODO lists using LLM reasoning
3. **Executes** tasks in a loop with status tracking
4. **Streams** real-time updates to the frontend
5. **Persists** state for resume capability

### Key Features

- **Real-time SSE Streaming** - Watch the agent work live (AG-UI protocol inspired)
- **LangGraph State Machine** - Clean, observable agent architecture
- **Artifact-Style UI** - Split-screen workspace (inspired by Claude/Cursor)
- **Persistence** - Resume sessions via SQLite checkpointing
- **Full Transparency** - Execution traces show every decision

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 14 + Shadcn)                        │
│  ┌────────────────────────┐  ┌────────────────────────────────────────┐ │
│  │     Chat Panel         │  │         Artifact Workspace             │ │
│  │  - Goal Input          │  │  - Real-time Task List                 │ │
│  │  - Agent Messages      │  │  - Progress Tracking                   │ │
│  │  - Phase Indicator     │  │  - Execution Log (Terminal-style)      │ │
│  └────────────────────────┘  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                              │ SSE (Server-Sent Events)
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI + LangGraph)                     │
│                                                                          │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐             │
│   │ ANALYZE │───▶│  PLAN   │───▶│ SELECT  │───▶│ EXECUTE │             │
│   │  Goal   │    │  TODOs  │    │  Task   │    │  Task   │             │
│   └─────────┘    └─────────┘    └────┬────┘    └────┬────┘             │
│                                      │              │                   │
│                                      │         ┌────▼────┐             │
│                                      │         │ REFLECT │             │
│                                      │         └────┬────┘             │
│                                      │              │                   │
│                                      └──────────────┘ (loop)            │
│                                                                          │
│                    SQLite Checkpointing for Persistence                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Agent** | LangGraph | Graph-based state machine with built-in checkpointing, streaming |
| **LLM** | OpenAI gpt-4.1-mini | Cost-efficient, fast, reliable structured output |
| **Backend** | FastAPI | Async-first, auto-generated OpenAPI docs, SSE support |
| **Frontend** | Next.js 14 | App Router, React Server Components, great DX |
| **UI** | Shadcn + Tailwind | Accessible, customizable, modern design |
| **State** | Zustand | Simple, performant, perfect for real-time updates |
| **Streaming** | SSE | Simpler than WebSocket for server→client, auto-reconnect |
| **Persistence** | SQLite | Zero-config, LangGraph native support |

---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- OpenAI API key

### Option 1: Docker (Recommended)

```bash
# Clone and enter directory
cd agent-todo-executor

# Set your OpenAI API key
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Start everything
docker-compose up --build

# Open http://localhost:3000
```

### Option 2: Manual Setup

**Backend:**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run server
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

---

## How It Works

### 1. Chat Planning Phase

User enters a high-level goal:
```
"Plan a weekend trip to Paris including flights, hotel, and activities"
```

The agent analyzes and responds with a structured TODO list.

### 2. Agent Execution Loop

```
┌─────────────────────────────────────────┐
│              EXECUTION LOOP              │
├─────────────────────────────────────────┤
│                                          │
│   1. SELECT_TASK                        │
│      └─ Pick first pending task          │
│                                          │
│   2. EXECUTE_TASK                       │
│      └─ Run task (simulated)            │
│      └─ Update status: done/failed      │
│                                          │
│   3. REFLECT                            │
│      └─ LLM analyzes result             │
│      └─ Generates status update         │
│                                          │
│   4. CHECK: More pending tasks?         │
│      └─ YES → Go to step 1              │
│      └─ NO  → COMPLETE                  │
│                                          │
└─────────────────────────────────────────┘
```

### 3. Real-Time Streaming

Events are streamed via SSE following this pattern:
```json
event: phase_change
data: {"phase": "executing", "session_id": "abc123"}

event: tasks_update
data: {"tasks": [...], "session_id": "abc123"}

event: trace
data: {"trace": {"node": "execute_task", "action": "execution_success", ...}}

event: message
data: {"role": "assistant", "content": "Task completed successfully!"}
```

### 4. Task Status Flow

```
pending ──► in_progress ──► completed
                        └──► failed
                        └──► needs_followup
```

---

## API Reference

### Start Execution
```http
POST /api/execute
Content-Type: application/json

{
  "goal": "Your high-level goal here"
}
```

### Stream Events (SSE)
```http
GET /api/stream/{session_id}?goal={encoded_goal}
Accept: text/event-stream
```

### Get Session State
```http
GET /api/session/{session_id}
```

Full API documentation: http://localhost:8000/docs

---

## Example Session Transcript

**User Input:**
```
Create a simple landing page for a new SaaS product
```

**Agent Response:**
```
I've broken down your goal into 5 tasks:

1. **Design hero section** - Create an engaging header with headline and CTA
2. **Build features section** - Showcase 3-4 key product features
3. **Add testimonials** - Include customer quotes and social proof
4. **Create pricing section** - Display pricing tiers with comparison
5. **Add footer with links** - Include navigation, social links, and legal

Starting execution...
```

**Execution Trace:**
```
[10:30:01] [plan_todos] → planning_complete - Created 5 tasks
[10:30:02] [select_task] → task_selected - Selected task: Design hero section
[10:30:02] [execute_task] → execution_started - Starting: Design hero section
[10:30:04] [execute_task] → execution_success - Completed: Design hero section
[10:30:05] [reflect] → reflection - Hero section complete. Moving to features (1/5 done)
[10:30:05] [select_task] → task_selected - Selected task: Build features section
...
[10:30:15] [complete] → execution_complete - Finished: 5/5 tasks completed
```

---

## Design Decisions & Trade-offs

### Why LangGraph over raw LangChain?
- **Graph-based control flow** - Clear, debuggable state transitions
- **Built-in checkpointing** - Persistence comes free
- **Streaming support** - Native async iteration over state updates
- **Human-in-the-loop ready** - Interrupt/resume patterns built-in

### Why SSE over WebSocket?
- **Simpler** - One-way streaming is sufficient for our use case
- **Auto-reconnect** - Browser handles reconnection automatically
- **Firewall-friendly** - Works over HTTP/1.1, no upgrade needed
- **Lower overhead** - No ping/pong frames, smaller payload

### Why Mock Task Execution?
- **Focus on architecture** - Demonstrates the loop pattern clearly
- **No external dependencies** - No need for real APIs/tools
- **Easy to extend** - Replace mock with real tools when needed
- **Cost-efficient demo** - Minimal LLM usage

### Why SQLite for Persistence?
- **Zero configuration** - No database server needed
- **LangGraph native** - `SqliteSaver` is built-in
- **Sufficient for demo** - Can migrate to PostgreSQL for production
- **File-based** - Easy to inspect, backup, reset

---

## What I Would Do With More Time

### Technical Improvements
1. **PostgreSQL + Redis** - Production-ready persistence with caching
2. **Real tools** - Web search, code execution, file operations
3. **Multi-agent** - Supervisor pattern for complex tasks
4. **Authentication** - JWT-based user sessions
5. **Rate limiting** - Protect API from abuse
6. **Testing** - Unit tests, integration tests, E2E with Playwright

### UX Improvements
1. **Task editing** - Allow users to modify tasks before execution
2. **Drag & drop** - Reorder tasks manually
3. **Export** - Download execution trace as JSON/PDF
4. **Dark/Light mode** - Theme toggle
5. **Mobile responsive** - Better small screen support
6. **Keyboard shortcuts** - Power user features

### Architecture
1. **Event sourcing** - Full audit trail of all changes
2. **CQRS** - Separate read/write models for scale
3. **Kubernetes** - Container orchestration for production
4. **LangSmith** - Full observability integration
5. **Retry logic** - Exponential backoff for failed tasks

---

## Project Structure

```
agent-todo-executor/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point
│   │   ├── agent/
│   │   │   ├── state.py      # LangGraph state definition
│   │   │   ├── nodes.py      # Graph node functions
│   │   │   └── graph.py      # Graph construction
│   │   ├── api/
│   │   │   ├── routes.py     # API endpoints
│   │   │   └── schemas.py    # Pydantic models
│   │   └── core/
│   │       └── config.py     # Settings management
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx      # Main page
│   │   │   └── layout.tsx    # Root layout
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── TaskList.tsx
│   │   │   └── ExecutionLog.tsx
│   │   ├── hooks/
│   │   │   └── useSSE.ts     # SSE connection hook
│   │   ├── store/
│   │   │   └── executorStore.ts
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

---

## Time Spent

| Phase | Time |
|-------|------|
| Architecture design | 30 min |
| Backend implementation | 1.5 hours |
| Frontend implementation | 1.5 hours |
| Integration & testing | 30 min |
| Documentation | 30 min |
| **Total** | **~4.5 hours** |

---

## License

MIT

---

## Contact

Built by [Your Name] for Libra Tech AI assessment.
