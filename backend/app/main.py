"""
FastAPI Application Entry Point.

TODO Executor Agent - A demonstration of modern agent architecture
with real-time streaming, persistence, and human-in-the-loop control.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router as api_router
from .core.config import get_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    settings = get_settings()
    logger.info(f"Starting {settings.app_name}")
    logger.info(f"Debug mode: {settings.debug}")

    # Setup LangSmith tracing if configured
    if settings.langsmith_api_key and settings.langsmith_tracing:
        import os
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langsmith_project
        logger.info(f"LangSmith tracing enabled for project: {settings.langsmith_project}")

    yield

    logger.info("Shutting down...")


def create_app() -> FastAPI:
    """Application factory."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        description="""
## TODO Executor Agent API

An AI-powered task execution system that:
- Takes high-level goals and breaks them into actionable tasks
- Executes tasks with real-time progress streaming
- Provides full transparency into agent reasoning
- Supports pause/resume for human-in-the-loop control

### Key Features
- **Real-time SSE Streaming**: Watch the agent work in real-time
- **Persistence**: Sessions survive restarts via SQLite checkpointing
- **AG-UI Protocol**: Modern streaming format with JSON patches
- **LangSmith Integration**: Full observability and tracing

### Tech Stack
- FastAPI + LangGraph + OpenAI
- Server-Sent Events for streaming
- SQLite for persistence
        """,
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc"
    )

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API routes
    app.include_router(api_router, prefix="/api")

    return app


# Create the app instance
app = create_app()


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "TODO Executor Agent",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/health"
    }
