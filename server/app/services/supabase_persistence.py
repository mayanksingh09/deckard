"""Supabase persistence helpers for realtime session data."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional

try:
    from supabase import Client, create_client
except ImportError as exc:  # pragma: no cover - library should be installed via pyproject
    Client = Any  # type: ignore[misc,assignment]

    def create_client(*_args: Any, **_kwargs: Any) -> Client:  # type: ignore[override]
        raise RuntimeError("Supabase client library is not installed") from exc

try:  # pragma: no cover - fallback for script execution contexts
    from ..config import settings
except Exception:  # pragma: no cover
    from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class MemoryRecord:
    """Structured payload representing a memory to persist."""

    label: str
    content: str
    profile_id: Optional[str] = None
    importance: Optional[float] = None
    embedding: Optional[list[float]] = None


class SupabasePersistence:
    """Lightweight wrapper around the Supabase client for inserts."""

    def __init__(self) -> None:
        self._enabled = bool(settings.supabase_url and settings.supabase_service_role_key)
        self._client: Client | None = None
        self._lock = asyncio.Lock()

    @property
    def enabled(self) -> bool:
        """Return whether Supabase persistence is configured."""

        return self._enabled

    def _ensure_client(self) -> Client:
        if not self._enabled:
            raise RuntimeError("Supabase credentials missing; persistence disabled")
        if self._client is None:
            self._client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        return self._client

    async def _execute(self, fn: Callable[[Client], Any]) -> Any:
        if not self._enabled:
            return None

        async with self._lock:
            try:
                return await asyncio.to_thread(lambda: fn(self._ensure_client()))
            except Exception:  # pragma: no cover - logging for observability
                logger.exception("Supabase persistence operation failed")
                return None

    @staticmethod
    def _filter_none(data: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in data.items() if value is not None}

    async def record_session_event(
        self,
        *,
        session_id: str,
        event_type: str,
        profile_id: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> None:
        """Persist a session event row."""

        if not self._enabled:
            return

        data: dict[str, Any] = {
            "session_id": session_id,
            "event_type": event_type,
        }
        if profile_id:
            data["profile_id"] = profile_id
        if payload is not None:
            data["payload"] = payload

        await self._execute(lambda client: client.table("session_events").insert(data).execute())

    async def record_message(
        self,
        *,
        role: str,
        content: str,
        conversation_id: Optional[str] = None,
        audio_asset_id: Optional[str] = None,
        latency_ms: Optional[int] = None,
    ) -> Optional[str]:
        """Persist a conversation message and return its id if available."""

        if not self._enabled:
            return None

        payload = self._filter_none(
            {
                "conversation_id": conversation_id,
                "role": role,
                "content": content,
                "audio_asset_id": audio_asset_id,
                "latency_ms": latency_ms,
            }
        )

        result = await self._execute(lambda client: client.table("messages").insert(payload).execute())
        data = getattr(result, "data", None)
        if isinstance(data, list) and data:
            first = data[0]
            if isinstance(first, dict):
                message_id = first.get("id")
                if isinstance(message_id, str):
                    return message_id
        return None

    async def record_memory(self, memory: MemoryRecord) -> Optional[str]:
        """Persist a memory record and return its id when Supabase responds with one."""

        if not self._enabled:
            return None

        data = self._filter_none(
            {
                "profile_id": memory.profile_id,
                "label": memory.label,
                "content": memory.content,
                "importance": memory.importance,
                "embedding": memory.embedding,
            }
        )

        result = await self._execute(lambda client: client.table("memories").insert(data).execute())
        inserted = getattr(result, "data", None)
        if isinstance(inserted, list) and inserted:
            first = inserted[0]
            if isinstance(first, dict):
                memory_id = first.get("id")
                if isinstance(memory_id, str):
                    return memory_id
        return None
