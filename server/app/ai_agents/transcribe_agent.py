from __future__ import annotations

import io
from typing import Optional

from openai import OpenAI

from app.services.did_talks import _pcm16le_to_wav


class TranscribeTalkAgent:
    """Lightweight agent that:
    1) Transcribes PCM16 mono audio to text via OpenAI gpt-4o-transcribe
    2) Generates a short assistant reply via a chat completion
    """

    def __init__(self, *, transcription_model: str = "gpt-4o-transcribe", chat_model: str = "gpt-4o-mini"):
        self.client = OpenAI()
        self.transcription_model = transcription_model
        self.chat_model = chat_model

    def transcribe_pcm(self, pcm: bytes, sample_rate: int = 24_000) -> str:
        wav_bytes = _pcm16le_to_wav(pcm, sample_rate=sample_rate)
        f = io.BytesIO(wav_bytes)
        f.name = "audio.wav"  # openai python SDK reads name for mime
        resp = self.client.audio.transcriptions.create(model=self.transcription_model, file=f)
        return getattr(resp, "text", "").strip()

    def generate_reply(self, user_text: str, system_prompt: Optional[str] = None) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_text})
        comp = self.client.chat.completions.create(model=self.chat_model, messages=messages)
        choice = comp.choices[0]
        content = choice.message.content or ""
        return content.strip()

