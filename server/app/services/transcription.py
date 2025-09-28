"""Voice transcription service skeleton."""
from __future__ import annotations

from typing import Any


class TranscriptionService:
    """Wraps Whisper-style transcription via the Responses API."""

    async def transcribe(self, audio_source: Any) -> str:
        """Convert the provided audio source into a text transcript."""

        raise NotImplementedError("transcribe will call OpenAI transcription APIs")
