"""Realtime voice session management."""
from __future__ import annotations

from typing import AsyncIterator, Iterable


class RealtimeVoiceService:
    """Handles lifecycle of OpenAI Realtime voice sessions."""

    async def start_session(self, session_id: str) -> None:
        """Open a new realtime session."""

        raise NotImplementedError("start_session will initiate OpenAI Realtime connections")

    async def stream_audio(self, session_id: str, audio_frames: Iterable[bytes]) -> AsyncIterator[bytes]:
        """Stream audio frames bidirectionally for lipsync workflows."""

        raise NotImplementedError("stream_audio will bridge client audio with OpenAI responses")

    async def close_session(self, session_id: str) -> None:
        """Terminate the realtime session and clean up resources."""

        raise NotImplementedError("close_session will finalize session state")
