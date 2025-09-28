"""Configuration helpers for the orchestrator service."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional


@dataclass
class Settings:
    """Centralized environment-driven configuration.

    Replace this lightweight dataclass with a pydantic BaseSettings implementation
    once dependencies are wired up. For now it documents the knobs the orchestrator
    expects without enforcing them.
    """

    openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
    runpod_base_url: str = os.getenv("RUNPOD_BASE_URL", "https://runpod.example.com")
    supabase_url: Optional[str] = os.getenv("SUPABASE_URL")
    supabase_service_role_key: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    # D-ID Talks API key
    did_api_key: Optional[str] = os.getenv("DID_API_KEY")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance to avoid repeated environment reads."""

    return Settings()


settings = get_settings()
