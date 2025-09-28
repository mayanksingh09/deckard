from __future__ import annotations

import asyncio

import pytest

from app.ai_agents import sentiment_classifying


class DummyResult:
    def __init__(self, final_output: str | None):
        self.final_output = final_output


def _run(coro):  # noqa: ANN001
    return asyncio.run(coro)


def test_classify_sentiment_uses_agent_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run(*args, **kwargs):  # noqa: ANN001, ANN002
        return DummyResult("positive")

    monkeypatch.setattr(sentiment_classifying.Runner, "run", fake_run)
    sentiment = _run(sentiment_classifying.classify_sentiment("We are moving ahead"))
    assert sentiment == "positive"


def test_classify_sentiment_falls_back_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run(*args, **kwargs):  # noqa: ANN001, ANN002
        raise RuntimeError("boom")

    monkeypatch.setattr(sentiment_classifying.Runner, "run", fake_run)
    sentiment = _run(sentiment_classifying.classify_sentiment("This is absolutely terrible"))
    assert sentiment == "negative"


def test_classify_sentiment_overrides_incorrect_positive(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run(*args, **kwargs):  # noqa: ANN001, ANN002
        return DummyResult("positive")

    monkeypatch.setattr(sentiment_classifying.Runner, "run", fake_run)
    sentiment = _run(sentiment_classifying.classify_sentiment("I am not happy about this result"))
    assert sentiment == "negative"


def test_classify_sentiment_empty_text(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_run(*args, **kwargs):  # noqa: ANN001, ANN002
        raise AssertionError("Agent should not be called for blank input")

    monkeypatch.setattr(sentiment_classifying.Runner, "run", fake_run)
    sentiment = _run(sentiment_classifying.classify_sentiment("   "))
    assert sentiment == "neutral"
