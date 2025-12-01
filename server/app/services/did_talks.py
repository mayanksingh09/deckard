from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx
from openai import OpenAI

try:
    from ..config import settings
except Exception:
    from app.config import settings


def _pcm16le_to_wav(pcm: bytes, sample_rate: int = 24_000, channels: int = 1) -> bytes:
    """Wrap raw PCM 16-bit little-endian mono data into a minimal WAV container."""
    import struct

    byte_rate = sample_rate * channels * 2
    block_align = channels * 2
    data_size = len(pcm)
    fmt_chunk_size = 16
    riff_chunk_size = 4 + (8 + fmt_chunk_size) + (8 + data_size)

    header = b"RIFF" + struct.pack("<I", riff_chunk_size) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", fmt_chunk_size, 1, channels, sample_rate, byte_rate, block_align, 16)
    header += b"data" + struct.pack("<I", data_size)
    return header + pcm


@dataclass
class DidTalkResult:
    talk_id: str
    status: str
    result_url: Optional[str]
    error: Optional[str] = None


class DIDTalksService:
    """RunPod-backed implementation that accepts PCM audio + persona image."""

    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        timeout: float = 300.0,
        webhook: Optional[str] = None,  # retained for API compatibility
        api_key: Optional[str] = None,  # retained for API compatibility
    ):
        raw_base = (base_url or settings.runpod_base_url or "").strip()
        if not raw_base:
            raise RuntimeError("RUNPOD_BASE_URL missing; set your RunPod FastAPI server URL")
        if not raw_base.startswith(("http://", "https://")):
            raise RuntimeError("RUNPOD_BASE_URL must include http/https scheme")
        self._base_url = raw_base.rstrip("/")
        self._timeout = timeout
        self._tts_client: Optional[OpenAI] = None
        if settings.openai_api_key:
            self._tts_client = OpenAI(api_key=settings.openai_api_key)

    async def create_talk_multipart(
        self,
        *,
        image_bytes: bytes,
        image_filename: str,
        audio_wav_bytes: bytes,
        timeout: Optional[float] = None,
    ) -> dict[str, object]:
        import logging
        logger = logging.getLogger(__name__)
        logger.info("Posting lip sync request to RunPod at %s/generate", self._base_url)
        image_mime = "image/png"
        if image_filename.lower().endswith((".jpg", ".jpeg")):
            image_mime = "image/jpeg"
        files = {
            "image": (image_filename, image_bytes, image_mime),
            "audio": ("audio.wav", audio_wav_bytes, "audio/wav"),
        }
        effective_timeout = timeout or self._timeout
        async with httpx.AsyncClient(timeout=effective_timeout) as client:
            resp = await client.post(f"{self._base_url}/generate", files=files)
            resp.raise_for_status()
            data = resp.json()
            logger.info("RunPod response payload keys: %s", list(data.keys()))
            return data

    def _coerce_result(self, data: dict[str, object]) -> DidTalkResult:
        raw_path = str(data.get("video_path") or data.get("path") or data.get("result") or "")
        talk_id = str(data.get("talk_id") or data.get("id") or raw_path or uuid.uuid4().hex)
        status = str(data.get("status") or "succeeded")
        result_url = self._build_result_url(raw_path) if raw_path else None
        error_value = data.get("error") if isinstance(data.get("error"), str) else None
        return DidTalkResult(
            talk_id=talk_id,
            status=status,
            result_url=result_url,
            error=None if status.lower() in {"succeeded", "done", "complete"} else error_value,
        )

    def _build_result_url(self, raw_path: str) -> str:
        if raw_path.startswith(("http://", "https://")):
            return raw_path
        normalized = raw_path.lstrip("./")
        return f"{self._base_url}/{normalized.lstrip('/')}"

    async def _load_image_bytes(self, source: str, timeout: float = 30.0) -> tuple[bytes, str]:
        parsed = urlparse(source)
        if parsed.scheme in {"http", "https"}:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(source)
                resp.raise_for_status()
                filename = Path(parsed.path).name or f"persona_{uuid.uuid4().hex}.png"
                return resp.content, filename

        path = Path(source)
        if not path.exists():
            raise FileNotFoundError(f"Persona image not found: {source}")
        return path.read_bytes(), path.name

    async def _synthesize_text_to_wav(self, text: str, voice_id: str) -> bytes:
        if not self._tts_client:
            raise RuntimeError("OPENAI_API_KEY required for text-based lip sync generation")

        voice = self._map_voice_id(voice_id)

        def _run_tts() -> bytes:
            response = self._tts_client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice=voice,
                input=text,
                format="wav",
            )
            return response.read()

        return await asyncio.to_thread(_run_tts)

    def _map_voice_id(self, voice_id: str) -> str:
        mapping = {
            "en-US-AriaNeural": "alloy",
            "en-US-GuyNeural": "baritone",
            "en-US-JennyNeural": "verse",
        }
        return mapping.get(voice_id, "alloy")

    async def generate_talk_from_pcm(
        self,
        *,
        pcm_bytes: bytes,
        sample_rate: int,
        persona_image_path: Path,
    ) -> DidTalkResult:
        image_bytes = persona_image_path.read_bytes()
        wav = _pcm16le_to_wav(pcm_bytes, sample_rate=sample_rate)
        data = await self.create_talk_multipart(
            image_bytes=image_bytes,
            image_filename=persona_image_path.name,
            audio_wav_bytes=wav,
        )
        result = self._coerce_result(data)
        import logging
        logger = logging.getLogger(__name__)
        logger.info("Lip sync video ready at %s", result.result_url)
        return result

    async def generate_talk_from_text(
        self,
        *,
        source_url: str,
        text: str,
        voice_id: str = "en-US-JennyNeural",
        webhook: Optional[str] = None,  # kept for interface compatibility
    ) -> DidTalkResult:
        image_bytes, image_filename = await self._load_image_bytes(source_url)
        wav_bytes = await self._synthesize_text_to_wav(text, voice_id)
        data = await self.create_talk_multipart(
            image_bytes=image_bytes,
            image_filename=image_filename,
            audio_wav_bytes=wav_bytes,
        )
        return self._coerce_result(data)


def resolve_persona_image(persona: str) -> Path:
    here = Path(__file__).resolve()
    repo_root = here.parents[3]
    public = repo_root / "web" / "public"
    mapping = {
        "joi": public / "joi.png",
        "officer_k": public / "officer_k.png",
        "officer_j": public / "officer_j.png",
    }
    key = persona.lower().strip()
    path = mapping.get(key, mapping["joi"])
    if not path.exists():
        raise FileNotFoundError(f"Persona image not found: {path}")
    return path


def resolve_persona_source_url(persona: str) -> Optional[str]:
    """No remote persona URLs are required; fallback to audio-only path."""
    return None
