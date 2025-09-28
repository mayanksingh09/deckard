"""FastAPI application entrypoint for the Deckard orchestrator."""
from ast import Import
import asyncio
import base64
import json
import logging
import struct
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing_extensions import assert_never

from agents.realtime import RealtimeRunner, RealtimeSession, RealtimeSessionEvent
from agents.realtime.config import RealtimeUserInputMessage
from agents.realtime.model_inputs import RealtimeModelSendRawMessage


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

from app.services.did_talks import DIDTalksService, resolve_persona_image

class RealtimeWebSocketManager:
    def __init__(self):
        self.active_sessions: dict[str, RealtimeSession] = {}
        self.session_contexts: dict[str, Any] = {}
        self.websockets: dict[str, WebSocket] = {}
        # Accumulate PCM 16-bit, 24kHz mono output per response for each session
        self.response_audio_buffers: dict[str, bytearray] = {}
        # Selected persona per session (mayank | ryan | agastya)
        self.persona: dict[str, str] = {}
        # Service instance (lazy)
        self._did_service: DIDTalksService | None = None

    def _service(self) -> DIDTalksService:
        if self._did_service is None:
            try:
                self._did_service = DIDTalksService()
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
        self.persona[session_id] = self.persona.get(session_id) or "mayank"

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

    async def _process_events(self, session_id: str):
        try:
            session = self.active_sessions[session_id]
            websocket = self.websockets[session_id]

            async for event in session:
                # Intercept audio stream for D-ID
                if event.type == "audio":
                    # Append raw PCM bytes for this response turn
                    self.response_audio_buffers.setdefault(session_id, bytearray()).extend(event.audio.data)
                elif event.type == "audio_end":
                    # Spawn background task to create a talk from the accumulated audio
                    pcm = bytes(self.response_audio_buffers.get(session_id, b""))
                    # Reset buffer for next turn
                    self.response_audio_buffers[session_id] = bytearray()
                    if pcm:
                        asyncio.create_task(self._create_talk_and_notify(session_id, pcm))

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
        persona = self.persona.get(session_id, "mayank")
        if websocket is None:
            return
        try:
            service = self._service()
            image_path = resolve_persona_image(persona)
            # Realtime outputs 24kHz mono PCM 16-bit
            result = await service.generate_talk_from_pcm(
                pcm_bytes=pcm, sample_rate=24_000, persona_image_path=image_path
            )
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
                persona = str(message.get("persona") or "mayank").lower()
                if persona not in {"mayank", "ryan", "agastya"}:
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
