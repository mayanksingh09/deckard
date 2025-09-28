"""FastAPI application entrypoint for the Deckard orchestrator."""
from pathlib import Path
import sys

# Ensure the project root (parent of this file's directory) is on sys.path
_THIS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _THIS_DIR.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

import asyncio
import base64
import json
import logging
import struct
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing_extensions import assert_never

from agents.realtime import RealtimeRunner, RealtimeSession, RealtimeSessionEvent
from agents.realtime.config import RealtimeUserInputMessage
from agents.realtime.model_inputs import RealtimeModelSendRawMessage

try:
    from .config import settings
except ImportError:  # pragma: no cover - script-style execution fallback
    from config import settings


# from .config import settings

# def create_app() -> FastAPI:
#     """Instantiate and configure the FastAPI application."""
#     application = FastAPI(
#         title="Deckard Agent Orchestrator",
#         description=(
#             "Skeleton service that will coordinate transcription, realtime voice, "
#             "avatar generation, and search workflows."
#         ),
#         version="0.1.0",
#     )

#     # TODO: register routers once implementations land.
#     # from .routers import realtime, sessions
#     # application.include_router(sessions.router)
#     # application.include_router(realtime.router)

#     return application

# app = create_app()

if TYPE_CHECKING:
    from .ai_agents.realtime_conversation import get_starting_agent
else:
    try:
        from .ai_agents.realtime_conversation import get_starting_agent
    except ImportError:
        from ai_agents.realtime_conversation import get_starting_agent
    

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.services.did_talks import (
    DIDTalksService,
    resolve_persona_image,
)
from app.services.did_talks import resolve_persona_source_url  # unused in realtime-only flow


class ResponseState(Enum):
    """States for tracking the response lifecycle."""
    IDLE = "idle"
    RESPONSE_STARTED = "response_started"
    BUFFERING = "buffering"
    GENERATING_VIDEO = "generating_video"
    READY = "ready"
    PLAYING = "playing"


@dataclass
class BufferedTextPart:
    """Structured text segment captured during a buffered response."""
    role: str
    text: str


@dataclass
class ResponseBuffer:
    """Buffer for collecting response audio and text."""
    response_id: str
    audio_chunks: list[bytes] = field(default_factory=list)
    text_parts: list[BufferedTextPart] = field(default_factory=list)
    started_at: float = field(default_factory=lambda: __import__('time').time())
    video_generation_started: bool = False
    video_url: Optional[str] = None
    video_talk_id: Optional[str] = None
    complete_text: Optional[str] = None
    complete_audio: Optional[bytes] = None

    @property
    def total_audio_bytes(self) -> int:
        """Total bytes of audio collected."""
        return sum(len(chunk) for chunk in self.audio_chunks)

    def add_text_part(self, text: str, role: str = "assistant") -> None:
        """Store a text fragment and its originating role."""
        cleaned_text = (text or "").strip()
        if not cleaned_text:
            return

        normalized_role = (role or "").strip().lower() or "assistant"
        self.text_parts.append(BufferedTextPart(role=normalized_role, text=cleaned_text))

    def get_full_text(self) -> str:
        """Get the complete assistant-authored text."""
        return " ".join(
            part.text for part in self.text_parts if part.role == "assistant"
        ).strip()

    def get_full_audio(self) -> bytes:
        """Get the complete audio from all chunks."""
        return b"".join(self.audio_chunks)


class RealtimeWebSocketManager:
    def __init__(self):
        self.active_sessions: dict[str, RealtimeSession] = {}
        self.session_contexts: dict[str, Any] = {}
        self.websockets: dict[str, WebSocket] = {}
        # Accumulate PCM 16-bit, 24kHz mono output per response for each session
        self.response_audio_buffers: dict[str, bytearray] = {}
        # Selected persona per session (joi | officer_k | officer_j)
        self.persona: dict[str, str] = {}
        # Service instance (lazy)
        self._did_service: DIDTalksService | None = None
        self._default_webhook: Optional[str] = settings.did_webhook_url

        # New response buffering system
        self.response_buffers: dict[str, ResponseBuffer] = {}  # session_id -> current response buffer
        self.response_states: dict[str, ResponseState] = {}  # session_id -> current state
        self.response_counters: dict[str, int] = {}  # session_id -> response counter for unique IDs

        # Response tracking for immediate mode
        self.active_response_texts: dict[str, list[str]] = {}  # session_id -> accumulating text parts
        self.active_response_ids: dict[str, str] = {}  # session_id -> current response_id

        # Configuration flags
        self.enable_response_buffering: bool = False  # Feature flag for buffering responses (disabled while fixing)

    def _service(self) -> DIDTalksService:
        if self._did_service is None:
            try:
                self._did_service = DIDTalksService(webhook=self._default_webhook)
            except Exception as e:
                logger.error("Failed to initialize D-ID service: %s", e)
                raise
        return self._did_service


    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.websockets[session_id] = websocket

        agent = get_starting_agent()
        runner = RealtimeRunner(agent)
        session_context = await runner.run()
        session = await session_context.__aenter__()
        self.active_sessions[session_id] = session
        self.session_contexts[session_id] = session_context
        # Initialize buffer and default persona
        self.response_audio_buffers[session_id] = bytearray()
        self.persona[session_id] = self.persona.get(session_id) or "joi"

        # Start event processing task
        asyncio.create_task(self._process_events(session_id))

    async def disconnect(self, session_id: str):
        if session_id in self.session_contexts:
            await self.session_contexts[session_id].__aexit__(None, None, None)
            del self.session_contexts[session_id]
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
        if session_id in self.websockets:
            del self.websockets[session_id]
        self.response_audio_buffers.pop(session_id, None)
        self.persona.pop(session_id, None)

        # Clean up new response tracking
        self.response_buffers.pop(session_id, None)
        self.response_states.pop(session_id, None)
        self.response_counters.pop(session_id, None)
        self.active_response_texts.pop(session_id, None)
        self.active_response_ids.pop(session_id, None)

    async def send_audio(self, session_id: str, audio_bytes: bytes):
        if session_id in self.active_sessions:
            await self.active_sessions[session_id].send_audio(audio_bytes)

    async def send_client_event(self, session_id: str, event: dict[str, Any]):
        """Send a raw client event to the underlying realtime model."""
        session = self.active_sessions.get(session_id)
        if not session:
            return
        await session.model.send_event(
            RealtimeModelSendRawMessage(
                message={
                    "type": event["type"],
                    "other_data": {k: v for k, v in event.items() if k != "type"},
                }
            )
        )

    async def send_user_message(self, session_id: str, message: RealtimeUserInputMessage):
        """Send a structured user message via the higher-level API (supports input_image)."""
        session = self.active_sessions.get(session_id)
        if not session:
            return
        await session.send_message(message)  # delegates to RealtimeModelSendUserInput path

    async def interrupt(self, session_id: str) -> None:
        """Interrupt current model playback/response for a session."""
        session = self.active_sessions.get(session_id)
        if not session:
            return
        await session.interrupt()

    def _has_text_generation_available(self, persona: str) -> bool:
        """Check if text-based D-ID generation is available for this persona."""
        try:
            from app.services.did_talks import resolve_persona_source_url as _r
        except Exception:
            from services.did_talks import resolve_persona_source_url as _r
        return bool(_r(persona))

    def _should_use_audio_for_did(self, persona: str) -> bool:
        """Check if we should use audio for D-ID generation (when no source URL is configured)."""
        return not self._has_text_generation_available(persona)

    def _get_next_response_id(self, session_id: str) -> str:
        """Generate a unique response ID for a session."""
        counter = self.response_counters.get(session_id, 0)
        self.response_counters[session_id] = counter + 1
        return f"{session_id}_response_{counter}"

    def _set_response_state(self, session_id: str, state: ResponseState) -> None:
        """Set the response state for a session."""
        old_state = self.response_states.get(session_id, ResponseState.IDLE)
        self.response_states[session_id] = state
        logger.info(f"[Session {session_id}] Response state: {old_state.value} -> {state.value}")

    def _start_response_buffer(self, session_id: str) -> ResponseBuffer:
        """Start a new response buffer for a session."""
        response_id = self._get_next_response_id(session_id)
        buffer = ResponseBuffer(response_id=response_id)
        self.response_buffers[session_id] = buffer
        self._set_response_state(session_id, ResponseState.RESPONSE_STARTED)
        logger.info(f"[Session {session_id}] Started new response buffer: {response_id}")
        return buffer

    def _get_response_buffer(self, session_id: str) -> Optional[ResponseBuffer]:
        """Get the current response buffer for a session."""
        return self.response_buffers.get(session_id)

    def _clear_response_buffer(self, session_id: str) -> None:
        """Clear the response buffer for a session."""
        if session_id in self.response_buffers:
            buffer = self.response_buffers[session_id]
            logger.info(f"[Session {session_id}] Clearing response buffer: {buffer.response_id}")
            del self.response_buffers[session_id]
        self._set_response_state(session_id, ResponseState.IDLE)

    async def _handle_buffered_audio(self, session_id: str, audio_data: bytes) -> None:
        """Handle audio data in buffering mode."""
        websocket = self.websockets.get(session_id)
        if not websocket:
            return

        # Get or create response buffer
        buffer = self._get_response_buffer(session_id)
        current_state = self.response_states.get(session_id, ResponseState.IDLE)

        if buffer is None or current_state == ResponseState.IDLE:
            # Start new response
            buffer = self._start_response_buffer(session_id)
            await self._send_filler_audio(session_id, "thinking")

        # Add audio to buffer
        buffer.audio_chunks.append(audio_data)
        self._set_response_state(session_id, ResponseState.BUFFERING)

    async def _send_filler_audio(self, session_id: str, filler_type: str = "thinking") -> None:
        """Send filler audio while processing response."""
        websocket = self.websockets.get(session_id)
        if not websocket:
            return

        # For now, send a simple notification - later we'll add actual filler audio
        await websocket.send_text(json.dumps({
            "type": "client_info",
            "info": "response_processing",
            "message": "Generating response with video...",
            "filler_type": filler_type
        }))
        logger.info(f"[Session {session_id}] Sent filler notification: {filler_type}")

    async def _handle_buffered_text(self, session_id: str, text: str, role: str = "assistant") -> None:
        """Handle text in buffering mode - start video generation and coordinate playback."""
        buffer = self._get_response_buffer(session_id)
        if not buffer:
            logger.warning(f"[Session {session_id}] No response buffer found for text handling")
            return

        normalized_role = (role or "").strip().lower() or "assistant"
        if normalized_role != "assistant":
            return

        # Add text to buffer
        buffer.add_text_part(text, role=normalized_role)
        buffer.complete_text = buffer.get_full_text()
        logger.info(f"[Session {session_id}] Added text to buffer, complete text: '{buffer.complete_text[:100]}{'...' if len(buffer.complete_text) > 100 else ''}'")

        # Start video generation if not already started
        if not buffer.video_generation_started:
            buffer.video_generation_started = True
            self._set_response_state(session_id, ResponseState.GENERATING_VIDEO)

            # Start video generation in background
            asyncio.create_task(self._generate_buffered_video(session_id, buffer))

    def _coerce_to_dict(self, value: Any) -> dict[str, Any] | None:
        """Best-effort conversion of SDK response objects into plain dictionaries."""
        if isinstance(value, dict):
            return value

        model_dump = getattr(value, "model_dump", None)
        if callable(model_dump):
            for kwargs in ({"mode": "json"}, {}):
                try:
                    dumped = model_dump(**kwargs)
                except TypeError:
                    continue
                except Exception:
                    dumped = None
                if isinstance(dumped, dict):
                    return dumped

        if hasattr(value, "__dict__"):
            try:
                data = dict(value.__dict__)
                return data
            except Exception:
                return None

        return None

    def _extract_assistant_text_from_response(self, response: Any) -> str:
        """Collect assistant-authored transcripts from a realtime response payload."""
        response_dict = self._coerce_to_dict(response)
        if not response_dict:
            return ""

        text_parts: list[str] = []
        for item in response_dict.get("output", []) or []:
            item_dict = self._coerce_to_dict(item)
            if not item_dict or item_dict.get("role") != "assistant":
                continue

            for part in item_dict.get("content", []) or []:
                part_dict = self._coerce_to_dict(part)
                if not part_dict:
                    continue

                part_type = part_dict.get("type")
                if part_type in {"text", "output_text"}:
                    candidate = part_dict.get("text")
                elif part_type in {"audio", "output_audio"}:
                    candidate = part_dict.get("transcript")
                else:
                    candidate = None

                if isinstance(candidate, str):
                    stripped = candidate.strip()
                    if stripped:
                        text_parts.append(stripped)

        return " ".join(text_parts).strip()

    async def _handle_assistant_response_output(self, session_id: str, response: Any) -> None:
        """Route assistant response text into the appropriate video generation path."""
        assistant_text = self._extract_assistant_text_from_response(response)
        if not assistant_text:
            logger.info(f"[Session {session_id}] No assistant text found in response output")
            return

        logger.info(
            f"[Session {session_id}] Assistant response text extracted: '{assistant_text[:200]}{'...' if len(assistant_text) > 200 else ''}'"
        )

        if self.enable_response_buffering:
            persona = self.persona.get(session_id, "joi")
            if self._has_text_generation_available(persona):
                await self._handle_buffered_text(session_id, assistant_text)
            else:
                logger.info(
                    f"[Session {session_id}] Persona {persona} lacks text generation support; skipping buffered video trigger"
                )
            return

        await self._trigger_video_from_text(session_id, assistant_text)

    async def _generate_buffered_video(self, session_id: str, buffer: ResponseBuffer) -> None:
        """Generate video for buffered response and coordinate final playback."""
        try:
            persona = self.persona.get(session_id, "joi")
            logger.info(f"[Session {session_id}] Starting buffered video generation for response {buffer.response_id}")

            # Generate the video
            src = resolve_persona_source_url(persona)
            if not src:
                logger.error(f"[Session {session_id}] No source URL for persona {persona}")
                await self._send_buffered_response_error(session_id, "No source URL configured")
                return

            service = self._service()
            voice_id = self._get_persona_voice_id(persona)

            logger.info(f"[Session {session_id}] Calling D-ID API for buffered response")
            result = await service.generate_talk_from_text(
                source_url=src,
                text=buffer.complete_text,
                voice_id=voice_id
            )

            # Store video result in buffer
            buffer.video_url = result.result_url
            buffer.video_talk_id = result.talk_id

            if result.status.lower() in {"done", "complete", "succeeded"} and result.result_url:
                logger.info(f"[Session {session_id}] Video generation successful, coordinating playback")
                await self._send_coordinated_response(session_id, buffer)
            else:
                logger.error(f"[Session {session_id}] Video generation failed: {result.status}")
                await self._send_buffered_response_error(session_id, f"Video generation failed: {result.status}")

        except Exception as e:
            logger.exception(f"[Session {session_id}] Video generation error: {e}")
            await self._send_buffered_response_error(session_id, str(e))

    async def _send_coordinated_response(self, session_id: str, buffer: ResponseBuffer) -> None:
        """Send the coordinated audio and video response."""
        websocket = self.websockets.get(session_id)
        if not websocket:
            return

        self._set_response_state(session_id, ResponseState.READY)
        persona = self.persona.get(session_id, "joi")

        # Send audio chunks for playback
        for chunk in buffer.audio_chunks:
            await websocket.send_text(json.dumps({
                "type": "audio",
                "audio": base64.b64encode(chunk).decode("utf-8")
            }))

        # Send video
        await websocket.send_text(json.dumps({
            "type": "talk_video",
            "persona": persona,
            "talk_id": buffer.video_talk_id,
            "status": "done",
            "url": buffer.video_url,
            "coordinated": True  # Flag to indicate this is coordinated playback
        }))

        # Notify completion
        await websocket.send_text(json.dumps({
            "type": "audio_end"
        }))

        logger.info(f"[Session {session_id}] Sent coordinated response: {buffer.total_audio_bytes} bytes audio + video")
        self._clear_response_buffer(session_id)

    async def _send_buffered_response_error(self, session_id: str, error: str) -> None:
        """Send error and fall back to audio-only playback."""
        websocket = self.websockets.get(session_id)
        if not websocket:
            return

        buffer = self._get_response_buffer(session_id)
        if buffer:
            # Send audio chunks for fallback playback
            for chunk in buffer.audio_chunks:
                await websocket.send_text(json.dumps({
                    "type": "audio",
                    "audio": base64.b64encode(chunk).decode("utf-8")
                }))

            await websocket.send_text(json.dumps({
                "type": "audio_end"
            }))

        # Send error notification
        await websocket.send_text(json.dumps({
            "type": "talk_error",
            "persona": self.persona.get(session_id, "joi"),
            "error": error
        }))

        logger.warning(f"[Session {session_id}] Sent buffered response error, fell back to audio-only")
        self._clear_response_buffer(session_id)

    async def _handle_raw_model_event(self, session_id: str, event_data: Any) -> None:
        """Handle raw OpenAI model events for response tracking."""
        try:
            # Log comprehensive information about the raw event
            logger.info(f"[Session {session_id}] Raw event received:")
            logger.info(f"[Session {session_id}] - Type: {type(event_data)}")
            logger.info(f"[Session {session_id}] - Data: {event_data}")

            if hasattr(event_data, '__dict__'):
                logger.info(f"[Session {session_id}] - Dict: {event_data.__dict__}")
            if hasattr(event_data, '__dir__'):
                logger.info(f"[Session {session_id}] - Dir: {[attr for attr in dir(event_data) if not attr.startswith('_')]}")

            # Try multiple ways to extract event type
            event_type = None
            if hasattr(event_data, 'type'):
                event_type = event_data.type
                logger.info(f"[Session {session_id}] - Found type via attribute: {event_type}")
            elif isinstance(event_data, dict) and 'type' in event_data:
                event_type = event_data['type']
                logger.info(f"[Session {session_id}] - Found type via dict: {event_type}")
            elif hasattr(event_data, '__getitem__'):
                try:
                    event_type = event_data['type']
                    logger.info(f"[Session {session_id}] - Found type via getitem: {event_type}")
                except (KeyError, TypeError):
                    pass

            if not event_type:
                logger.warning(f"[Session {session_id}] Could not extract event type from raw event")
                return

            logger.info(f"[Session {session_id}] Processing raw model event: {event_type}")

            # Handle wrapped OpenAI events in raw_server_event
            if event_type == "raw_server_event":
                # Extract nested OpenAI event
                nested_data = None
                if hasattr(event_data, 'data'):
                    nested_data = event_data.data
                elif isinstance(event_data, dict) and 'data' in event_data:
                    nested_data = event_data['data']

                if not nested_data:
                    logger.warning(f"[Session {session_id}] No nested data in raw_server_event")
                    return

                # Get the actual OpenAI event type
                openai_event_type = None
                if isinstance(nested_data, dict):
                    openai_event_type = nested_data.get('type')

                if not openai_event_type:
                    logger.info(f"[Session {session_id}] No OpenAI event type in nested data: {nested_data}")
                    return

                logger.info(f"[Session {session_id}] Processing OpenAI event: {openai_event_type}")

                # Process OpenAI events
                await self._process_openai_event(session_id, openai_event_type, nested_data)

            elif event_type == "response.created":
                # Try multiple ways to get response data
                response_data = None
                if hasattr(event_data, 'response'):
                    response_data = event_data.response
                elif isinstance(event_data, dict) and 'response' in event_data:
                    response_data = event_data['response']

                response_id = f'resp_{int(__import__("time").time())}'
                if response_data:
                    if hasattr(response_data, 'id'):
                        response_id = response_data.id
                    elif isinstance(response_data, dict) and 'id' in response_data:
                        response_id = response_data['id']

                self.active_response_ids[session_id] = response_id
                self.active_response_texts[session_id] = []
                logger.info(f"[Session {session_id}] Response started: {response_id}")

            elif event_type == "response.text.delta":
                # Try multiple ways to get delta
                text_delta = ''
                if hasattr(event_data, 'delta'):
                    text_delta = event_data.delta
                elif isinstance(event_data, dict) and 'delta' in event_data:
                    text_delta = event_data['delta']

                if text_delta and session_id in self.active_response_texts:
                    self.active_response_texts[session_id].append(text_delta)

            elif event_type == "response.text.done":
                # Try multiple ways to get text content
                text_content = ''
                if hasattr(event_data, 'text'):
                    text_content = event_data.text
                elif isinstance(event_data, dict) and 'text' in event_data:
                    text_content = event_data['text']

                if text_content:
                    logger.info(f"[Session {session_id}] Text done: '{text_content[:100]}{'...' if len(text_content) > 100 else ''}'")

            elif event_type == "response.audio_transcript.done":
                # Try multiple ways to get transcript
                transcript = ''
                if hasattr(event_data, 'transcript'):
                    transcript = event_data.transcript
                elif isinstance(event_data, dict) and 'transcript' in event_data:
                    transcript = event_data['transcript']

                if transcript:
                    logger.info(f"[Session {session_id}] Audio transcript done: '{transcript[:100]}{'...' if len(transcript) > 100 else ''}'")

            elif event_type == "response.output_item.done":
                # This contains the complete item with all content
                item = None
                if hasattr(event_data, 'item'):
                    item = event_data.item
                elif isinstance(event_data, dict) and 'item' in event_data:
                    item = event_data['item']

                if item:
                    logger.info(f"[Session {session_id}] Output item done, extracting text")

            elif event_type == "response.done":
                response_id = self.active_response_ids.get(session_id)
                logger.info(f"[Session {session_id}] Response complete: {response_id}")

                response_payload = None
                if hasattr(event_data, 'response'):
                    response_payload = event_data.response
                elif isinstance(event_data, dict):
                    response_payload = event_data.get('response')

                await self._handle_assistant_response_output(session_id, response_payload)

                # Clean up
                self.active_response_texts.pop(session_id, None)
                self.active_response_ids.pop(session_id, None)

        except Exception as e:
            logger.exception(f"[Session {session_id}] Error handling raw model event: {e}")

    async def _process_openai_event(self, session_id: str, event_type: str, event_data: dict) -> None:
        """Process OpenAI events extracted from raw_server_event."""
        try:
            logger.info(f"[Session {session_id}] OpenAI event details: {event_type}")

            if event_type == "response.created":
                response_id = event_data.get('response', {}).get('id', f'resp_{int(__import__("time").time())}')
                self.active_response_ids[session_id] = response_id
                self.active_response_texts[session_id] = []
                logger.info(f"[Session {session_id}] Response started: {response_id}")

            elif event_type == "response.text.delta":
                text_delta = event_data.get('delta', '')
                if text_delta and session_id in self.active_response_texts:
                    self.active_response_texts[session_id].append(text_delta)
                    logger.info(f"[Session {session_id}] Text delta: '{text_delta}'")

            elif event_type == "response.text.done":
                text_content = event_data.get('text', '')
                if text_content:
                    logger.info(f"[Session {session_id}] Text done: '{text_content[:100]}{'...' if len(text_content) > 100 else ''}'")

            elif event_type == "response.audio_transcript.delta":
                transcript_delta = event_data.get('delta', '')
                if transcript_delta and session_id in self.active_response_texts:
                    self.active_response_texts[session_id].append(transcript_delta)
                    logger.info(f"[Session {session_id}] Transcript delta: '{transcript_delta}'")

            elif event_type == "response.audio_transcript.done":
                transcript = event_data.get('transcript', '')
                if transcript:
                    logger.info(f"[Session {session_id}] Audio transcript done: '{transcript[:100]}{'...' if len(transcript) > 100 else ''}'")

            elif event_type == "response.output_item.done":
                item = event_data.get('item', {})
                if item:
                    logger.info(f"[Session {session_id}] Output item done, extracting text")

            elif event_type == "conversation.item.created":
                item = event_data.get('item', {})
                if item and item.get('role') == 'assistant':
                    logger.info(f"[Session {session_id}] Conversation item created for assistant")

            elif event_type == "response.done":
                response_id = self.active_response_ids.get(session_id)
                logger.info(f"[Session {session_id}] Response complete: {response_id}")

                await self._handle_assistant_response_output(
                    session_id,
                    event_data.get('response'),
                )

                # Clean up
                self.active_response_texts.pop(session_id, None)
                self.active_response_ids.pop(session_id, None)

            else:
                logger.info(f"[Session {session_id}] Unhandled OpenAI event: {event_type}")

        except Exception as e:
            logger.exception(f"[Session {session_id}] Error processing OpenAI event {event_type}: {e}")

    async def _extract_text_from_nested_item(self, session_id: str, item: dict) -> None:
        """Extract text from a nested item structure."""
        try:
            if item.get('type') != 'message' or item.get('role') != 'assistant':
                return

            content = item.get('content', [])
            text_parts = []

            for part in content:
                if isinstance(part, dict):
                    part_type = part.get('type')
                    if part_type == 'text':
                        text = part.get('text', '')
                        if text.strip():
                            text_parts.append(text)
                    elif part_type == 'audio':
                        transcript = part.get('transcript', '')
                        if transcript.strip():
                            text_parts.append(transcript)

            if text_parts:
                full_text = ' '.join(text_parts)
                logger.info(f"[Session {session_id}] Extracted text from nested item: '{full_text[:100]}{'...' if len(full_text) > 100 else ''}'")
                await self._trigger_video_from_text(session_id, full_text)

        except Exception as e:
            logger.exception(f"[Session {session_id}] Error extracting text from nested item: {e}")

    async def _extract_text_from_any_event(self, session_id: str, event_type: str, event_data: dict) -> None:
        """Fallback: try to extract text from any event that might contain it."""
        try:
            # Look for text or transcript in the event data
            text_candidates = []

            role = (event_data.get('role') or '').strip().lower() if isinstance(event_data, dict) else ''
            if role and role != 'assistant':
                logger.debug(
                    f"[Session {session_id}] Skipping {event_type} with non-assistant role: {role}"
                )
                return

            # Direct text/transcript fields
            direct_text = event_data.get('text') if isinstance(event_data, dict) else None
            direct_transcript = event_data.get('transcript') if isinstance(event_data, dict) else None
            if isinstance(direct_text, str):
                text_candidates.append(direct_text)
            if isinstance(direct_transcript, str):
                text_candidates.append(direct_transcript)

            # Text in item content
            item = event_data.get('item', {})
            if isinstance(item, dict):
                item_role = (item.get('role') or '').strip().lower()
                if item_role and item_role != 'assistant':
                    logger.debug(
                        f"[Session {session_id}] Skipping item content with role: {item_role}"
                    )
                    item = None

            if isinstance(item, dict):
                content = item.get('content', [])
                for part in content:
                    if isinstance(part, dict):
                        p_type = part.get('type')
                        if p_type in {'text', 'output_text'}:
                            text_value = part.get('text')
                            if isinstance(text_value, str):
                                text_candidates.append(text_value)
                        elif p_type == 'audio':
                            transcript_value = part.get('transcript')
                            if isinstance(transcript_value, str):
                                text_candidates.append(transcript_value)

            # If we found any text, trigger video generation
            if text_candidates:
                full_text = ' '.join(text_candidates)
                if full_text.strip():
                    logger.info(f"[Session {session_id}] Found text in {event_type}: '{full_text[:100]}{'...' if len(full_text) > 100 else ''}'")
                    await self._trigger_video_from_text(session_id, full_text)

        except Exception as e:
            logger.debug(f"[Session {session_id}] No text found in event {event_type}: {e}")

    async def _extract_text_from_output_item(self, session_id: str, item: Any) -> None:
        """Extract text from a complete output item."""
        try:
            item_type = getattr(item, 'type', None)
            if item_type != 'message':
                return

            role = getattr(item, 'role', None)
            if role != 'assistant':
                return

            content = getattr(item, 'content', [])
            text_parts = []

            for part in content:
                part_type = getattr(part, 'type', None)
                if part_type == 'text':
                    text = getattr(part, 'text', '')
                    if text.strip():
                        text_parts.append(text)
                elif part_type == 'audio':
                    transcript = getattr(part, 'transcript', '')
                    if transcript.strip():
                        text_parts.append(transcript)

            if text_parts:
                full_text = ' '.join(text_parts)
                logger.info(f"[Session {session_id}] Extracted text from output item: '{full_text[:100]}{'...' if len(full_text) > 100 else ''}'")
                await self._trigger_video_from_text(session_id, full_text)

        except Exception as e:
            logger.exception(f"[Session {session_id}] Error extracting text from output item: {e}")

    async def _trigger_video_from_text(self, session_id: str, text: str) -> None:
        """Trigger D-ID video generation from extracted text."""
        if not text.strip():
            return

        persona = self.persona.get(session_id, "joi")
        logger.info(f"[Session {session_id}] Triggering video generation for persona {persona}")

        if self._has_text_generation_available(persona):
            logger.info(f"[Session {session_id}] Starting D-ID video generation with text: '{text[:100]}{'...' if len(text) > 100 else ''}'")
            asyncio.create_task(self._create_talk_from_text_and_notify(session_id, text))
        else:
            logger.info(f"[Session {session_id}] No text generation available for persona {persona} (no source URL configured)")

    async def _process_events(self, session_id: str):
        try:
            session = self.active_sessions[session_id]
            websocket = self.websockets[session_id]

            async for event in session:
                # Intercept assistant audio stream and build a D-ID talk when the turn ends
                if event.type == "audio":
                    persona = self.persona.get(session_id, "joi")

                    # Check if we should use buffering for coordinated playback
                    if self.enable_response_buffering and self._has_text_generation_available(persona):
                        # Use new buffering system for coordinated audio/video
                        await self._handle_buffered_audio(session_id, event.audio.data)
                    else:
                        # Legacy audio handling - immediate playback and optional D-ID from audio
                        if self._should_use_audio_for_did(persona):
                            self.response_audio_buffers.setdefault(session_id, bytearray()).extend(event.audio.data)
                elif event.type == "audio_end":
                    # Generate audio-based D-ID talk if no text source URL is configured
                    persona = self.persona.get(session_id, "joi")
                    if self._should_use_audio_for_did(persona):
                        pcm = bytes(self.response_audio_buffers.get(session_id, b""))
                        self.response_audio_buffers[session_id] = bytearray()
                        if pcm:
                            asyncio.create_task(self._create_talk_and_notify(session_id, pcm))
                elif event.type == "history_added":
                    # If the assistant produced text, kick off a D-ID talk from text
                    logger.info(f"[Session {session_id}] Processing history_added event")
                    try:
                        item = getattr(event, "item", None)
                        role = getattr(item, "role", None)
                        item_type = getattr(item, "type", None)
                        logger.info(f"[Session {session_id}] History item: type={item_type}, role={role}")

                        if item_type == "message" and role == "assistant":
                            # Gather any text parts from content
                            text_parts: list[str] = []
                            content = getattr(item, "content", [])
                            logger.info(f"[Session {session_id}] Assistant message content has {len(content or [])} parts")

                            for i, part in enumerate(content or []):
                                try:
                                    ptype = getattr(part, "type", None)

                                    # Accept plain text or transcripts
                                    if ptype in {"text", "output_text"}:
                                        t = getattr(part, "text", None)
                                        if isinstance(t, str) and t.strip():
                                            text_parts.append(t)
                                            logger.info(f"[Session {session_id}] Added text part: '{t[:100]}{'...' if len(t) > 100 else ''}'")
                                    elif ptype == "audio":
                                        tr = getattr(part, "transcript", None)
                                        if isinstance(tr, str) and tr.strip():
                                            text_parts.append(tr)
                                            logger.info(f"[Session {session_id}] Added transcript part: '{tr[:100]}{'...' if len(tr) > 100 else ''}'")
                                except Exception as part_error:
                                    logger.warning(f"[Session {session_id}] Failed to process content part {i}: {part_error}")
                                    continue

                            full_text = " ".join(tp.strip() for tp in text_parts if tp.strip()).strip()
                            logger.info(f"[Session {session_id}] Extracted full text ({len(full_text)} chars): '{full_text[:200]}{'...' if len(full_text) > 200 else ''}'")

                            if full_text:
                                persona = self.persona.get(session_id, "joi")
                                logger.info(f"[Session {session_id}] Current persona: {persona}")

                                if self._has_text_generation_available(persona):
                                    if self.enable_response_buffering:
                                        # Use new buffering system for coordinated audio/video
                                        await self._handle_buffered_text(
                                            session_id,
                                            full_text,
                                            role=role,
                                        )
                                    else:
                                        # Legacy immediate D-ID generation
                                        logger.info(f"[Session {session_id}] Text generation available for persona {persona}, starting D-ID video generation")
                                        asyncio.create_task(self._create_talk_from_text_and_notify(session_id, full_text))
                                else:
                                    logger.info(f"[Session {session_id}] No text generation available for persona {persona} (no source URL configured)")
                            else:
                                logger.info(f"[Session {session_id}] No text extracted from assistant message")
                        else:
                            logger.info(f"[Session {session_id}] Skipping non-assistant message: type={item_type}, role={role}")
                    except Exception as e:
                        # Never break the event loop on parsing mishaps
                        logger.exception(f"[Session {session_id}] Failed to inspect history_added for text: {e}")
                elif event.type == "raw_model_event":
                    # Handle raw model events for response tracking
                    await self._handle_raw_model_event(session_id, event.data)

                event_data = await self._serialize_event(event)
                await websocket.send_text(json.dumps(event_data))
        except Exception as e:
            logger.error(f"Error processing events for session {session_id}: {e}")

    async def _serialize_event(self, event: RealtimeSessionEvent) -> dict[str, Any]:
        base_event: dict[str, Any] = {
            "type": event.type,
        }

        if event.type == "agent_start":
            base_event["agent"] = event.agent.name
        elif event.type == "agent_end":
            base_event["agent"] = event.agent.name
        elif event.type == "handoff":
            base_event["from"] = event.from_agent.name
            base_event["to"] = event.to_agent.name
        elif event.type == "tool_start":
            base_event["tool"] = event.tool.name
        elif event.type == "tool_end":
            base_event["tool"] = event.tool.name
            base_event["output"] = str(event.output)
        elif event.type == "audio":
            base_event["audio"] = base64.b64encode(event.audio.data).decode("utf-8")
        elif event.type == "audio_interrupted":
            pass
        elif event.type == "audio_end":
            pass
        elif event.type == "history_updated":
            base_event["history"] = [item.model_dump(mode="json") for item in event.history]
        elif event.type == "history_added":
            # Provide the added item so the UI can render incrementally.
            try:
                base_event["item"] = event.item.model_dump(mode="json")
            except Exception:
                base_event["item"] = None
        elif event.type == "guardrail_tripped":
            base_event["guardrail_results"] = [
                {"name": result.guardrail.name} for result in event.guardrail_results
            ]
        elif event.type == "raw_model_event":
            base_event["raw_model_event"] = {
                "type": event.data.type,
            }
        elif event.type == "error":
            base_event["error"] = str(event.error) if hasattr(event, "error") else "Unknown error"
        elif event.type == "input_audio_timeout_triggered":
            pass
        else:
            assert_never(event)

        return base_event

    async def _create_talk_and_notify(self, session_id: str, pcm: bytes) -> None:
        websocket = self.websockets.get(session_id)
        persona = self.persona.get(session_id, "joi")
        if websocket is None:
            return
        try:
            service = self._service()
            image_path = resolve_persona_image(persona)
            # Realtime outputs 24kHz mono PCM 16-bit
            await websocket.send_text(json.dumps({
                "type": "client_info",
                "info": "did_talk_start",
                "persona": persona,
                "mode": "audio",
            }))
            result = await service.generate_talk_from_pcm(
                pcm_bytes=pcm, sample_rate=24_000, persona_image_path=image_path
            )
            await websocket.send_text(json.dumps({
                "type": "client_info",
                "info": "did_talk_status",
                "persona": persona,
                "status": result.status,
            }))
            payload: dict[str, Any] = {
                "type": "talk_video",
                "persona": persona,
                "talk_id": result.talk_id,
                "status": result.status,
                "url": result.result_url,
            }
            await websocket.send_text(json.dumps(payload))
        except Exception as e:
            err_payload = {
                "type": "talk_error",
                "persona": persona,
                "error": str(e),
            }
            try:
                await websocket.send_text(json.dumps(err_payload))
            except Exception:
                logger.exception("Failed sending talk_error to client")

    # STT path intentionally removed in realtime-only flow

    def _get_persona_voice_id(self, persona: str) -> str:
        """Get the appropriate Microsoft voice ID for each persona."""
        voice_mapping = {
            "joi": "en-US-AriaNeural",  # Sophisticated, warm female voice
            "officer_k": "en-US-GuyNeural",  # Deep, authoritative male voice
            "officer_j": "en-US-JennyNeural",  # Clear, professional female voice
        }
        return voice_mapping.get(persona.lower(), "en-US-JennyNeural")

    async def _create_talk_from_text_and_notify(self, session_id: str, text: str) -> None:
        websocket = self.websockets.get(session_id)
        persona = self.persona.get(session_id, "joi")
        logger.info(f"[Session {session_id}] Starting D-ID talk generation for persona {persona}")

        if websocket is None:
            logger.error(f"[Session {session_id}] No websocket found, cannot notify client")
            return

        try:
            # Resolve source URL from environment; required for text-mode
            src = resolve_persona_source_url(persona)
            logger.info(f"[Session {session_id}] Resolved source URL for {persona}: {src[:50] + '...' if src and len(src) > 50 else src}")

            if not src:
                logger.warning(f"[Session {session_id}] No source URL configured for persona {persona}, skipping text-based D-ID generation")
                return

            service = self._service()
            voice_id = self._get_persona_voice_id(persona)
            logger.info(f"[Session {session_id}] Using voice ID: {voice_id}")

            # Notify client that video generation is starting
            logger.info(f"[Session {session_id}] Notifying client that D-ID talk generation is starting")
            await websocket.send_text(json.dumps({
                "type": "client_info",
                "info": "did_talk_start",
                "persona": persona,
                "mode": "text",
            }))

            logger.info(f"[Session {session_id}] Calling D-ID API with text: '{text[:100]}{'...' if len(text) > 100 else ''}'")
            result = await service.generate_talk_from_text(
                source_url=src,
                text=text,
                voice_id=voice_id,
                webhook=self._default_webhook,
            )
            logger.info(f"[Session {session_id}] D-ID generation completed with status: {result.status}, talk_id: {result.talk_id}")

            # Notify client of generation status
            logger.info(f"[Session {session_id}] Notifying client of D-ID status: {result.status}")
            await websocket.send_text(json.dumps({
                "type": "client_info",
                "info": "did_talk_status",
                "persona": persona,
                "status": result.status,
            }))

            # Send the final video result
            payload: dict[str, Any] = {
                "type": "talk_video",
                "persona": persona,
                "talk_id": result.talk_id,
                "status": result.status,
                "url": result.result_url,
            }
            logger.info(f"[Session {session_id}] Sending video result: status={result.status}, url={result.result_url[:50] + '...' if result.result_url and len(result.result_url) > 50 else result.result_url}")
            await websocket.send_text(json.dumps(payload))

        except Exception as e:
            logger.exception(f"[Session {session_id}] D-ID talk generation failed: {e}")
            err_payload = {
                "type": "talk_error",
                "persona": persona,
                "error": str(e),
            }
            try:
                await websocket.send_text(json.dumps(err_payload))
                logger.info(f"[Session {session_id}] Sent error notification to client")
            except Exception as send_error:
                logger.exception(f"[Session {session_id}] Failed sending talk_error to client (text mode): {send_error}")


manager = RealtimeWebSocketManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(lifespan=lifespan)


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    image_buffers: dict[str, dict[str, Any]] = {}
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "audio":
                # Convert int16 array to bytes
                int16_data = message["data"]
                audio_bytes = struct.pack(f"{len(int16_data)}h", *int16_data)
                await manager.send_audio(session_id, audio_bytes)
            elif message["type"] == "image":
                logger.info("Received image message from client (session %s).", session_id)
                # Build a conversation.item.create with input_image (and optional input_text)
                data_url = message.get("data_url")
                prompt_text = message.get("text") or "Please describe this image."
                if data_url:
                    logger.info(
                        "Forwarding image (structured message) to Realtime API (len=%d).",
                        len(data_url),
                    )
                    user_msg: RealtimeUserInputMessage = {
                        "type": "message",
                        "role": "user",
                        "content": (
                            [
                                {"type": "input_image", "image_url": data_url, "detail": "high"},
                                {"type": "input_text", "text": prompt_text},
                            ]
                            if prompt_text
                            else [{"type": "input_image", "image_url": data_url, "detail": "high"}]
                        ),
                    }
                    await manager.send_user_message(session_id, user_msg)
                    # Acknowledge to client UI
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "client_info",
                                "info": "image_enqueued",
                                "size": len(data_url),
                            }
                        )
                    )
                else:
                    await websocket.send_text(
                        json.dumps(
                            {
                                "type": "error",
                                "error": "No data_url for image message.",
                            }
                        )
                    )
            elif message["type"] == "commit_audio":
                # Force close the current input audio turn
                await manager.send_client_event(session_id, {"type": "input_audio_buffer.commit"})
            elif message["type"] == "image_start":
                img_id = str(message.get("id"))
                image_buffers[img_id] = {
                    "text": message.get("text") or "Please describe this image.",
                    "chunks": [],
                }
                await websocket.send_text(
                    json.dumps({"type": "client_info", "info": "image_start_ack", "id": img_id})
                )
            elif message["type"] == "image_chunk":
                img_id = str(message.get("id"))
                chunk = message.get("chunk", "")
                if img_id in image_buffers:
                    image_buffers[img_id]["chunks"].append(chunk)
                    if len(image_buffers[img_id]["chunks"]) % 10 == 0:
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "client_info",
                                    "info": "image_chunk_ack",
                                    "id": img_id,
                                    "count": len(image_buffers[img_id]["chunks"]),
                                }
                            )
                        )
            elif message["type"] == "image_end":
                img_id = str(message.get("id"))
                buf = image_buffers.pop(img_id, None)
                if buf is None:
                    await websocket.send_text(
                        json.dumps({"type": "error", "error": "Unknown image id for image_end."})
                    )
                else:
                    data_url = "".join(buf["chunks"]) if buf["chunks"] else None
                    prompt_text = buf["text"]
                    if data_url:
                        logger.info(
                            "Forwarding chunked image (structured message) to Realtime API (len=%d).",
                            len(data_url),
                        )
                        user_msg2: RealtimeUserInputMessage = {
                            "type": "message",
                            "role": "user",
                            "content": (
                                [
                                    {
                                        "type": "input_image",
                                        "image_url": data_url,
                                        "detail": "high",
                                    },
                                    {"type": "input_text", "text": prompt_text},
                                ]
                                if prompt_text
                                else [
                                    {"type": "input_image", "image_url": data_url, "detail": "high"}
                                ]
                            ),
                        }
                        await manager.send_user_message(session_id, user_msg2)
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "client_info",
                                    "info": "image_enqueued",
                                    "id": img_id,
                                    "size": len(data_url),
                                }
                            )
                        )
                    else:
                        await websocket.send_text(
                            json.dumps({"type": "error", "error": "Empty image."})
                        )
            elif message["type"] == "interrupt":
                await manager.interrupt(session_id)
            elif message["type"] == "set_persona":
                persona = str(message.get("persona") or "joi").lower()
                if persona not in {"joi", "officer_k", "officer_j"}:
                    await websocket.send_text(
                        json.dumps({"type": "error", "error": f"Unknown persona: {persona}"})
                    )
                else:
                    manager.persona[session_id] = persona
                    await websocket.send_text(
                        json.dumps({"type": "client_info", "info": "persona_set", "persona": persona})
                    )

    except WebSocketDisconnect:
        await manager.disconnect(session_id)


@app.get("/")
async def root() -> dict[str, str]:
    """Lightweight health endpoint for service discovery."""
    return {"service": "deckard-realtime", "status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        # Increased WebSocket frame size to comfortably handle image data URLs.
        ws_max_size=16 * 1024 * 1024,
    )
