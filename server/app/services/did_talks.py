from __future__ import annotations

import base64
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple

import httpx

# Support both package and script import contexts for settings
try:
    from ..config import settings  # when imported as part of the app package
except Exception:  # pragma: no cover - fallback for script-style execution
    try:
        from app.config import settings  # when "app" is a top-level package
    except Exception:  # final fallback when running from server/app as CWD
        from config import settings


API_BASE = "https://api.d-id.com"


def _pcm16le_to_wav(pcm: bytes, sample_rate: int = 24_000, channels: int = 1) -> bytes:
    """Wrap raw PCM 16-bit little-endian mono data into a minimal WAV container.

    D-ID accepts audio uploads; wrapping to WAV ensures content-type/audio container is explicit.
    """
    import struct

    byte_rate = sample_rate * channels * 2
    block_align = channels * 2
    data_size = len(pcm)
    fmt_chunk_size = 16
    riff_chunk_size = 4 + (8 + fmt_chunk_size) + (8 + data_size)

    header = b"RIFF" + struct.pack("<I", riff_chunk_size) + b"WAVE"
    # fmt chunk
    header += b"fmt " + struct.pack("<IHHIIHH", fmt_chunk_size, 1, channels, sample_rate, byte_rate, block_align, 16)
    # data chunk
    header += b"data" + struct.pack("<I", data_size)
    return header + pcm


@dataclass
class DidTalkResult:
    talk_id: str
    status: str
    result_url: Optional[str]
    error: Optional[str] = None


class DIDTalksService:
    def __init__(self, api_key: Optional[str] = None):
        raw_key = api_key or settings.did_api_key
        if not raw_key:
            raise RuntimeError("DID_API_KEY missing; set in environment")
        # Support USERNAME:PASSWORD or single token (password may be empty)
        if ":" in raw_key:
            user, pwd = raw_key.split(":", 1)
        else:
            user, pwd = raw_key, ""
        self._auth = (user, pwd)

    def _base_headers(self) -> dict[str, str]:
        # D-ID prefers Basic auth with API key as username and empty password.
        # We'll pass auth=(api_key, "") to httpx and keep basic JSON defaults here.
        return {"Accept": "application/json"}

    async def create_talk_multipart(
        self,
        *,
        image_bytes: bytes,
        image_filename: str,
        audio_wav_bytes: bytes,
        timeout: float = 30.0,
    ) -> str:
        """Create a talk by uploading image + audio as multipart. Returns talk id."""
        files = {
            "source_image": (image_filename, image_bytes, "image/jpeg" if image_filename.endswith(".jpeg") or image_filename.endswith(".jpg") else "image/png"),
            "audio": ("audio.wav", audio_wav_bytes, "audio/wav"),
        }
        async with httpx.AsyncClient(
            base_url=API_BASE,
            headers=self._base_headers(),
            timeout=timeout,
            auth=self._auth,
        ) as client:
            resp = await client.post("/talks", files=files)
            resp.raise_for_status()
            data = resp.json()
            talk_id = data.get("id") or data.get("talk_id")
            if not talk_id:
                raise RuntimeError(f"Unexpected response from D-ID: {data}")
            return str(talk_id)

    async def get_talk(self, talk_id: str, timeout: float = 30.0) -> DidTalkResult:
        async with httpx.AsyncClient(
            base_url=API_BASE,
            headers=self._base_headers(),
            timeout=timeout,
            auth=self._auth,
        ) as client:
            resp = await client.get(f"/talks/{talk_id}")
            resp.raise_for_status()
            data = resp.json()
            status = str(data.get("status") or data.get("state") or "unknown")
            result_url = data.get("result_url") or (data.get("result") or {}).get("url")
            error = data.get("error") or None
            return DidTalkResult(talk_id=talk_id, status=status, result_url=result_url, error=error)

    async def wait_for_result(self, talk_id: str, *, poll_interval: float = 1.0, max_wait: float = 120.0) -> DidTalkResult:
        deadline = asyncio.get_event_loop().time() + max_wait
        last = None
        while asyncio.get_event_loop().time() < deadline:
            last = await self.get_talk(talk_id)
            if last.status.lower() in {"done", "complete", "succeeded"}:
                return last
            if last.status.lower() in {"error", "failed"}:
                return last
            await asyncio.sleep(poll_interval)
        # Timed out
        if last is None:
            return DidTalkResult(talk_id=talk_id, status="timeout", result_url=None, error="Timeout waiting for result")
        return DidTalkResult(talk_id=talk_id, status="timeout", result_url=last.result_url, error="Timeout")

    async def generate_talk_from_pcm(
        self,
        *,
        pcm_bytes: bytes,
        sample_rate: int,
        persona_image_path: Path,
    ) -> DidTalkResult:
        image_bytes = persona_image_path.read_bytes()
        wav = _pcm16le_to_wav(pcm_bytes, sample_rate=sample_rate)
        talk_id = await self.create_talk_multipart(
            image_bytes=image_bytes,
            image_filename=persona_image_path.name,
            audio_wav_bytes=wav,
        )
        return await self.wait_for_result(talk_id)

    async def create_talk_text(
        self,
        *,
        source_url: str,
        text: str,
        webhook: Optional[str] = None,
        timeout: float = 30.0,
    ) -> str:
        payload: dict[str, object] = {
            "source_url": source_url,
            "script": {
                "type": "text",
                "input": text,
            },
        }
        if webhook:
            # According to example provided, webhook lives under script
            assert isinstance(payload["script"], dict)
            payload["script"]["webhook"] = webhook
        async with httpx.AsyncClient(
            base_url=API_BASE,
            headers={**self._base_headers(), "Content-Type": "application/json"},
            timeout=timeout,
            auth=self._auth,
        ) as client:
            resp = await client.post("/talks", json=payload)
            resp.raise_for_status()
            data = resp.json()
            talk_id = data.get("id") or data.get("talk_id")
            if not talk_id:
                raise RuntimeError(f"Unexpected response from D-ID: {data}")
            return str(talk_id)

    async def generate_talk_from_text(
        self,
        *,
        source_url: str,
        text: str,
        webhook: Optional[str] = None,
    ) -> DidTalkResult:
        talk_id = await self.create_talk_text(source_url=source_url, text=text, webhook=webhook)
        return await self.wait_for_result(talk_id)


def resolve_persona_image(persona: str) -> Path:
    """Map a short persona key to the repository's web/public image path."""
    # This file: server/app/services/did_talks.py
    here = Path(__file__).resolve()
    repo_root = here.parents[3]  # .../deckard
    public = repo_root / "web" / "public"
    mapping = {
        # New keys mapped to existing public assets
        "joi": public / "joi.png",
        "officer_k": public / "officer_k.png",
        "officer_j": public / "officer_j.png"
    }
    key = persona.lower().strip()
    if key not in mapping:
        # default to joi
        key = "joi"
    path = mapping[key]
    if not path.exists():
        raise FileNotFoundError(f"Persona image not found: {path}")
    return path


def resolve_persona_source_url(persona: str) -> Optional[str]:
    key = persona.lower().strip()
    env_key = {
        "joi": "DID_SOURCE_URL_JOI",
        "officer_k": "DID_SOURCE_URL_OFFICER_K",
        "officer_j": "DID_SOURCE_URL_OFFICER_J",
    }.get(key)
    if not env_key:
        return None
    import os
    return os.getenv(env_key)
