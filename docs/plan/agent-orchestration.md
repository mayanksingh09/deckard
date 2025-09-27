# Deckard Agent Orchestration Plan

## 0. Intent & Success Criteria
- Deliver a modular backend orchestrator that turns raw user voice input into coordinated tasks across OpenAI Responses, Realtime Voice APIs, StableAvatar inference on RunPod, and a web-search assistant.
- Use the new Responses API (per migration guide) and the `openai-agents-python` toolkit for deterministic agent lifecycle management, tool definition, and streaming.
- Ensure the plan yields production-ready code hosted locally first, then deployable to Render, with clear contracts so the React front end in `web/` can call into the orchestrator.

## 1. Key References & Assumptions
- Voice-to-text handled via Whisper (Responses API `gpt-4o-mini-transcribe` or comparable model) wrapped as an agent tool.
- StableAvatar model runs on a RunPod-hosted Gradio app; we communicate via HTTP endpoints exposed by that pod.
- Render instance runs the orchestrator (FastAPI / Starlette) but we prototype locally in-repo under a new `server/` directory.
- Web search uses OpenAI web-browsing tool (Responses API with `gpt-5` + `reasoning: {effort: "medium"}` and `response.create` with `tools.web_search`), or fallback to Tavily-like service if required later.
- Realtime voice pipeline uses OpenAI Realtime API (WebRTC or WebSocket) to converse; when a response audio stream completes, we capture transcript + audio, then trigger StableAvatar lipsync workload by calling the RunPod service.
- All orchestration logic written in TypeScript or Python? Use Python to leverage `openai-agents-python` (makes sense). We'll expose HTTP endpoints for web UI.
- Secrets provided via `.env.local` during local dev; production secrets managed via Render dashboard.

## 2. Target User Flows
1. **Voice prompt ingestion** → audio uploaded from the browser to backend → transcribed to text prompt → agent session created.
2. Based on prompt classification, orchestrator:
   - **2a. Avatar seed image generation**: use Responses API image generation (e.g., `gpt-image-1`) to produce a portrait, feed to StableAvatar as reference.
   - **2b. Realtime conversation**: open Realtime Voice session, stream conversation, pipe system output into StableAvatar lipsync job after receiving audio.
   - **2c. Web search**: when prompt requires information retrieval, call web search tool, summarize results vocally.
3. Backend persists session + artifacts (prompts, images, audio URLs) in Supabase or local storage for now; returns status updates to frontend.

## 3. Architecture Overview
- **Client (Next.js)** -> HTTP/WebSocket -> **Orchestrator Service** (FastAPI + openai-agents) -> **Agents** -> Tools:
  - Whisper transcription
  - Image Tool (OpenAI Responses image generation)
  - Realtime Voice Orchestrator (OpenAI Realtime session manager)
  - Web Search Tool (Responses web search capability)
  - StableAvatar Tool (RunPod REST endpoint for lipsync)
- Persistence: PostgreSQL via Supabase (later), local SQLite for prototyping.
- Messaging: Async tasks handled with `asyncio` + background workers; optional Celery for future scaling.

## 4. Agent & Tool Design
- **Coordinator Agent** (parent) using openai-agents framework to select sub-agents/tools based on classification.
- **VoiceToPrompt Tool**: wraps Whisper transcription; activated on raw audio input; returns structured prompt (text + metadata like speaker, language, timestamp).
- **AvatarSeed Agent**: uses Responses image generation; parameters for style, cropping; stores image URL/path.
- **RealtimeConversation Agent**:
  - Initiates Realtime session with `gpt-realtime` (per documentation).
  - Maintains streaming connection; collects transcripts and audio buffers.
  - On session completion, passes audio to StableAvatar Tool.
- **StableAvatar Tool**:
  - HTTP client targeting RunPod Gradio app (assume `/generate` endpoint accepting `audio_url`, `image_url`, `session_id`).
  - Polls for job completion and returns final media link.
- **WebSearch Agent**:
  - Wraps `client.responses.create` with `tools=[{"type":"web_search"}]` (per migration guide) using GPT-5.
  - Parses results, synthesizes spoken answer via TTS (Responses API audio output) and optionally triggers StableAvatar playback.

## 5. Deliverables & Directory Layout
```
server/
  app/
    __init__.py
    main.py                 # FastAPI app exposing endpoints for frontend
    config.py               # Env loading and OpenAI keys
    routers/
      sessions.py           # REST endpoints for creating orchestration sessions
      realtime.py           # Websocket proxy for Realtime API if needed
    services/
      orchestration.py      # High-level coordinator logic
      transcription.py      # VoiceToPrompt tool implementation
      image_generation.py   # Avatar seed image agent
      realtime_voice.py     # Realtime API manager
      stableavatar.py       # RunPod client
      web_search.py         # Search agent
    agents/
      coordinator.py
      avatar_seed.py
      realtime_conversation.py
      web_search_agent.py
    models/
      schemas.py            # Pydantic models for requests/responses
      storage.py            # Persistence abstractions
  tests/
    test_orchestration.py
scripts/
  run_local_server.sh
```
- Add `requirements.txt` in `server/` listing `fastapi`, `uvicorn`, `openai`, `openai-agents`, `httpx`, `pydantic`, `python-dotenv`, etc.
- Provide example `.env` entries in `server/.env.example` (no secrets committed).

## 6. Phase-wise Implementation Plan

### Phase 0 – Project Bootstrap
- [ ] Create `server/` directory with Poetry or pip-tools setup; include linting (ruff/black) and ASGI entrypoint.
- [ ] Define shared config loader using `pydantic-settings` for API keys (OpenAI, RunPod, Supabase placeholder).
- [ ] Document local run command (`uvicorn server.app.main:app --reload`).

### Phase 1 – Transcription & Prompt Routing
- [ ] Implement `/api/sessions` POST that accepts uploaded audio (multipart) and metadata.
- [ ] Build `VoiceToPrompt` tool wrapping `client.responses.create(model="gpt-4o-mini-transcribe")` using the new Responses API.
- [ ] Classify prompt intent (avatar seed vs realtime vs search) using coordinator agent (Responses call with tool selection defined via `openai-agents`).
- [ ] Persist session record (in-memory store for now) with prompt, detected intent, and tool plan.

### Phase 2 – Avatar Seed Generation Path
- [ ] Implement `AvatarSeedAgent` leveraging `client.responses.create(model="gpt-image-1", modalities=["text","image"]...)`.
- [ ] Store resulting image (base64 or URL) to local storage (`server/data/avatars/`) and return path to client.
- [ ] Add optional enhancement prompts (style presets, error handling).
- [ ] Write integration test covering voice->seed flow.

### Phase 3 – Realtime Voice Pipeline
- [ ] Implement service that creates a Realtime session via websocket (per docs) and proxies audio between client and OpenAI.
- [ ] Capture assistant audio output, save to temp storage, generate transcript via `client.responses.create`.
- [ ] On session termination, call StableAvatar tool with audio + chosen avatar seed to produce lip-synced video.
- [ ] Provide webhook or polling endpoint for front end to fetch final video URL.
- [ ] Add graceful cleanup for temp audio files.

### Phase 4 – StableAvatar Tooling (RunPod Integration)
- [ ] Define RunPod client in `stableavatar.py` using `httpx.AsyncClient` with configurable base URL and API key (if required).
- [ ] Implement job submission body matching Gradio endpoint schema (assume `/api/predict` style payload) and parse response.
- [ ] Add polling with exponential backoff, timeouts, and surfacing of job status to orchestrator session state.
- [ ] Mock RunPod API in tests to validate happy path + failure handling.

### Phase 5 – Web Search Agent
- [ ] Add `WebSearchAgent` with `client.responses.create(model="gpt-5", tools=[{"type":"web_search"}])` and reasoning budget controls.
- [ ] Parse tool output, keep top N results, summarize for TTS.
- [ ] Use Responses API `response.create` audio output (e.g. `modalities=["text","audio"]`) to synthesize reply; stream to frontend and optionally to StableAvatar for playback.
- [ ] Extend coordinator agent to dispatch to WebSearch when classification indicates knowledge query.

### Phase 6 – Session Persistence & Frontend Hooks
- [ ] Introduce SQLite/Supabase integration to store sessions, artifacts, statuses.
- [ ] Add events endpoint (`/api/sessions/{id}/events`) delivering step-by-step status updates (Server-Sent Events or polling).
- [ ] Implement Supabase storage upload helpers (using service role when deployed) for generated media.
- [ ] Provide TypeScript client in `web/src/lib/agents.ts` to interact with backend endpoints during local testing.

### Phase 7 – Deployment Readiness
- [ ] Write Dockerfile for orchestrator (python base, uvicorn).
- [ ] Create Render blueprint (render.yaml) or documentation for manual deploy (Gunicorn command, env vars.)
- [ ] Document RunPod + Render integration steps (allowed origins, health checks, scaling policies).
- [ ] Run end-to-end manual test covering all three intents.

## 7. Detailed Implementation Notes
- **OpenAI Responses Migration**: Use `client.responses.create()` everywhere (no legacy ChatCompletion). Ensure `response.output[0].content` parsing per migration docs.
- **openai-agents-python**: Define tools with decorators, register with `AgentRuntime`. For example, `@tool()` decorated async functions; coordinator agent orchestrates via `runtime.next_action()` loop.
- **Realtime Voice**: follow docs to create ephemeral keys if needed; since backend proxies calls, maintain session handshake and forward ICE candidates when using WebRTC (phase 3 deliverable includes Node helper if necessary).
- **Audio Handling**: store WAV/MP3 in `server/tmp/`; use `ffmpeg` (via `ffmpeg-python`) to convert sample rates required by StableAvatar.
- **StableAvatar Integration Assumptions**: treat RunPod endpoint as asynchronous job returning job ID. Provide configuration to toggle between mock (for local tests) and real endpoint.
- **Web Search**: adopt minimal caching to avoid repeated identical queries; log prompt + response for auditing with PII scrubbing.

## 8. Testing & Verification Strategy
- Write unit tests per service (transcription, classification, stableavatar client) using `pytest` + `pytest-asyncio`.
- Provide integration test harness that simulates voice upload (fixtures with sample WAV) and validates orchestrated outputs (mocked external services).
- For realtime path, build a scripted test using prerecorded audio chunks and check final lipsync job call.
- Document manual QA checklist in `docs/plan/testing.md` (to be created later) covering multi-intent sessions.

## 9. Observability & Error Handling
- Integrate structured logging (`structlog` or standard logging with JSON formatter) capturing session_id, agent, tool_name, duration.
- Add OpenTelemetry hooks once deployed to Render for tracing (future enhancement).
- Provide retry/backoff wrappers around external APIs (OpenAI, RunPod, Supabase) with circuit breaker pattern.

## 10. Security & Compliance Considerations
- Never log raw audio/text prompts with PII; mask transcripts when storing.
- Use signed URLs for media assets; clean temp files after job completion.
- Manage API keys via environment variables; for local dev, add `.env.local` instructions in `server/README.md`.
- Consider consent capture for recording voice; ensure compliance when shipping.

## 11. Documentation Deliverables
- [ ] `server/README.md` explaining setup, environment, run commands, API contract.
- [ ] Update `docs/plan/plan.md` with cross-reference when execution begins.
- [ ] Provide sequence diagrams (PlantUML or Mermaid) for the three main flows within this doc or a follow-up doc.

## 12. Open Questions & Follow-ups
- How will frontend capture and stream audio to backend (WebRTC vs chunked upload)? Need decision for Phase 1.
- Confirm RunPod StableAvatar API contract (input formats, expected latency).
- Determine caching strategy for generated avatar seeds (reuse vs regenerate each session).
- Decide whether to store Realtime audio output in Supabase or stream directly to StableAvatar.
- Evaluate fallback when OpenAI web search is disabled (maybe integrate Tavily).

Once tasks above are complete and checked off, the orchestrator should be ready for implementation in this repo and subsequent deployment to Render.
