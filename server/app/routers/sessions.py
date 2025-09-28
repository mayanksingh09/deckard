"""Session management endpoints for the orchestrator."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models import schemas

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/", response_model=schemas.SessionResponse)
async def create_session(payload: schemas.SessionCreateRequest) -> schemas.SessionResponse:
    """Create a new orchestration session stub.

    The actual implementation will hand the request off to the orchestration service
    to decide which agents and tools to invoke.
    """

    raise HTTPException(status_code=501, detail="Session creation not implemented yet")


@router.get("/{session_id}", response_model=schemas.SessionStatusResponse)
async def get_session_status(session_id: str) -> schemas.SessionStatusResponse:
    """Return the current status for the requested session."""

    raise HTTPException(status_code=501, detail="Session status lookup not implemented yet")
