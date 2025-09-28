"""Application package bootstrap hooks."""
from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv


_ROOT_DIR = Path(__file__).resolve().parent.parent

# Load base env first, then allow .env.local to override for developer-specific tweaks.
load_dotenv(_ROOT_DIR / ".env")
load_dotenv(_ROOT_DIR / ".env.local", override=True)
