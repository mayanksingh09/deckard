from __future__ import annotations

import importlib
import os

import app.config as config


def test_settings_reads_supabase_db_url(monkeypatch):
    original_env = os.environ.get("SUPABASE_DB_URL")
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://localhost:54321/testdb")

    reloaded = importlib.reload(config)

    try:
        assert reloaded.settings.supabase_db_url == "postgresql://localhost:54321/testdb"
    finally:
        if original_env is None:
            os.environ.pop("SUPABASE_DB_URL", None)
        else:
            os.environ["SUPABASE_DB_URL"] = original_env
        importlib.reload(config)
