# Repository Guidelines

## Project Structure & Module Organization
- `app/main.py` boots the FastAPI application and should register routers defined under `app/routers/`.
- Domain logic lives in `app/services/` and `app/ai_agents/`; keep integrations (OpenAI, StableAvatar, web search) in service modules and keep agents focused on orchestration.
- Shared request/response schemas belong in `app/models/`, while static assets (prompt templates, sample payloads) sit in `app/static/`.
- Tests reside in `tests/`; mirror module names so `tests/test_<module>.py` covers its counterpart. Use `tmp/` strictly for transient artifacts and clean it in long-running jobs.
- Planning notes remain in `docs/`; pull architectural context from `docs/plan/agent-orchestration.md` before large changes.

## Build, Test, and Development Commands
- `uv sync` installs dependencies from `pyproject.toml`/`uv.lock` (create a virtualenv first with `uv venv` or `python -m venv .venv`).
- `uv run uvicorn app.main:app --reload` launches the API locally with hot reload; use `--host`/`--port` when exposing the orchestrator to other services.
- `uv run ruff check app tests` enforces lint rules (append `--fix` for quick wins) and `uv run ruff format app tests` keeps formatting aligned.
- `uv run pytest` executes the suite in `tests/`; start by stubbing unit tests for new routers and agent flows.

## Coding Style & Naming Conventions
- Target Python 3.12+, four-space indentation, and exhaustive type hints on public interfaces.
- Prefer explicit module paths (e.g., `from app.services.voice import VoiceService`) and keep file names snake_case.
- Run Ruff before pushing; CI will fail on format or lint drift.

## Testing Guidelines
- Expand `pytest` coverage alongside features: unit tests for routers/services, integration tests for agent orchestration using fixture doubles.
- Name test modules `test_<feature>.py` and functions `test_<behavior>` to keep discovery predictable.
- For flows touching external APIs, prefer fakes under `tests/conftest.py` and mock network I/O at the edge.
- Always write tests for every code module and always run all tests after completing the task to verify if everything works as expected

## Commit & Pull Request Guidelines
- Write commits in the imperative mood ("Add agent session store"); squash noisy WIP commits locally.
- PRs should outline the change, note any new environment variables, and link to relevant planning docs under `docs/`.
- Include manual verification notes (local run, lint, tests) and screenshots for API payload examples when helpful.

## Security & Configuration Tips
- Copy forthcoming `.env.example` to `.env.local`; never commit secrets. Reference variables via `app.config` helpers instead of `os.environ` in-line.
- Restrict long-running temp files to `tmp/` and scrub sensitive artifacts after debugging sessions.
- Keep service keys scoped per environment and rotate them when handing off agent integrations.
