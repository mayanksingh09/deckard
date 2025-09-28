# Deckard Orchestrator Service (Skeleton)

This directory houses the FastAPI-based backend that will orchestrate voice input, OpenAI agent coordination, StableAvatar rendering, and web search integrations. The current contents are scaffolding generated from `docs/plan/agent-orchestration.md` and are intended to be fleshed out by the implementation phase.

## Getting Started
- Create a Python virtual environment (Python 3.11+ recommended).
- Install dependencies once the `pyproject.toml`/`requirements` files are added.
- Copy `.env.example` (to be created) into `.env.local` and populate OpenAI, RunPod, and Supabase credentials.
- Launch the API with `uvicorn app.main:app --reload` after wiring up routers and services.

## Directory Guide
- `app/main.py` – FastAPI entrypoint; register routers here.
- `app/config.py` – Environment configuration helpers.
- `app/routers/` – HTTP and WebSocket endpoints.
- `app/services/` – Integrations for transcription, realtime voice, StableAvatar, and web search.
- `app/agents/` – Agent wrappers built on `openai-agents-python`.
- `app/models/` – Pydantic schemas for request/response contracts.
- `tests/` – Pytest suite (expand with unit and integration coverage).
- `tmp/` – Workdir for transient media artifacts (add cleanup strategy before production).

## Next Steps
Consult `docs/plan/agent-orchestration.md` for the detailed implementation checklist, including tooling decisions, deployment notes, and open questions.
