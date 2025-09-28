"""Pydantic models describing request and response payloads."""
from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    """Incoming payload for creating a new orchestration session."""

    prompt: str = Field(..., description="User prompt or transcript driving the session")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Arbitrary client metadata")


class SessionResponse(BaseModel):
    """Response returned after session creation."""

    session_id: str = Field(..., description="Identifier for the orchestration session")
    status: str = Field(default="pending", description="Initial session status")


class SessionStatusResponse(BaseModel):
    """Represents the current state of a session."""

    session_id: str
    status: str
    details: Optional[Dict[str, Any]] = None
