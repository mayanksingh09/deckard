"""Automatically load environment variables for the server package.

Python imports this module (if present) during interpreter startup after the
standard library's `site` module completes. Placing the loader here guarantees
.env files populate `os.environ` before application modules execute, even when
scripts are run directly (e.g. `python app/agents/web_search_agent.py`).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


_ROOT_DIR = Path(__file__).resolve().parent

# Load default values, then developer overrides.
load_dotenv(_ROOT_DIR / ".env")
load_dotenv(_ROOT_DIR / ".env.local", override=True)

# Mark import for diagnostics; useful in unit tests to confirm bootstrap success.
os.environ.setdefault("SERVER_DOTENV_LOADED", "1")
