"""Realtime voice proxy endpoints."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket

router = APIRouter(prefix="/realtime", tags=["realtime"])


@router.websocket("/voice")
async def realtime_voice_gateway(websocket: WebSocket) -> None:
    """Proxy websocket connections to the OpenAI Realtime API.

    The future implementation will handle authentication, session negotiation, and
    bidirectional streaming of audio frames.
    """

    await websocket.close(code=4404)
