"""
Configuration management using Pydantic Settings.
Environment-based config with sensible defaults.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_name: str = "TODO Executor Agent"
    debug: bool = False

    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-4.1-mini"

    # Database
    database_url: str = "sqlite:///./checkpoints.db"

    # LangSmith (optional but recommended)
    langsmith_api_key: Optional[str] = None
    langsmith_project: str = "todo-executor"
    langsmith_tracing: bool = True

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
