"""Sentiment classification agent with heuristic fallback."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from typing import Iterable

from openai.types.shared import Reasoning

from agents import Agent, ModelSettings, Runner
from dotenv import load_dotenv

load_dotenv()


logger = logging.getLogger(__name__)


SENTIMENT_LABELS = {"positive", "negative", "neutral"}
NEGATION_WORDS = {
    "no",
    "not",
    "never",
    "none",
    "hardly",
    "scarcely",
    "rarely",
    "can't",
    "cannot",
    "don't",
    "didn't",
    "isn't",
    "wasn't",
    "won't",
    "wouldn't",
    "shouldn't",
}
INTENSIFIER_WORDS = {"really", "very", "extremely", "super", "so", "incredibly"}
POSITIVE_WORDS = {
    "amazing",
    "awesome",
    "good",
    "great",
    "happy",
    "love",
    "loved",
    "lovely",
    "fantastic",
    "satisfied",
    "pleased",
    "wonderful",
    "excellent",
    "enjoy",
    "enjoying",
    "enjoyed",
    "glad",
    "delighted",
    "perfect",
    "positive",
}
NEGATIVE_WORDS = {
    "angry",
    "awful",
    "bad",
    "disappointed",
    "disappointing",
    "hate",
    "hated",
    "horrible",
    "sad",
    "terrible",
    "unhappy",
    "upset",
    "worse",
    "worst",
    "negative",
    "frustrated",
    "frustrating",
    "mad",
    "annoyed",
    "irritated",
    "dissatisfied",
}
STRONG_POSITIVE_WORDS = {"ecstatic", "thrilled", "outstanding", "phenomenal"}
STRONG_NEGATIVE_WORDS = {"furious", "devastated", "miserable", "horrendous", "appalling"}


@dataclass(slots=True)
class HeuristicResult:
    label: str
    confidence: int


sentiment_classifying_agent = Agent(
    name="Sentiment Classifying Agent",
    instructions=(
        "Classify the sentiment of the provided message. "
        "Output exactly one of: positive, negative, neutral."
    ),
    tools=[],
    model="gpt-5-mini",
    model_settings=ModelSettings(
        reasoning=Reasoning(effort="minimal"),
        verbosity="low",
    ),
)


async def _run_agent_sentiment(message: str) -> str | None:
    try:
        result = await Runner.run(sentiment_classifying_agent, input=message)
    except Exception as exc:  # pragma: no cover - network/API failure path
        logger.warning("Sentiment agent call failed; falling back to heuristic: %s", exc)
        return None

    final_output = getattr(result, "final_output", None)
    if isinstance(final_output, str):
        candidate = final_output.strip().lower()
        if candidate in SENTIMENT_LABELS:
            return candidate
        logger.debug("Agent returned unexpected sentiment '%s'", candidate)
    else:
        logger.debug("Agent returned non-string sentiment output: %r", final_output)
    return None


def _tokenize(text: str) -> Iterable[str]:
    return re.findall(r"[a-zA-Z']+", text.lower())


def _heuristic_sentiment(text: str) -> HeuristicResult:
    tokens = list(_tokenize(text))
    if not tokens:
        return HeuristicResult("neutral", 0)

    score = 0
    pending_negation = False
    intensity_boost = 0

    for token in tokens:
        if token in NEGATION_WORDS:
            pending_negation = True
            intensity_boost = 0
            continue

        if token in INTENSIFIER_WORDS:
            intensity_boost = min(intensity_boost + 1, 2)
            continue

        weight = 0
        if token in STRONG_POSITIVE_WORDS:
            weight = 2
        elif token in STRONG_NEGATIVE_WORDS:
            weight = -2
        elif token in POSITIVE_WORDS:
            weight = 1
        elif token in NEGATIVE_WORDS:
            weight = -1
        else:
            intensity_boost = 0
            continue

        if intensity_boost:
            weight += 1 if weight > 0 else -1
            intensity_boost = 0

        if pending_negation:
            weight = -weight
            pending_negation = False

        score += weight

    if score > 0:
        return HeuristicResult("positive", score)
    if score < 0:
        return HeuristicResult("negative", abs(score))
    return HeuristicResult("neutral", 0)


async def classify_sentiment(message: str) -> str:
    """Classify sentiment via the agent with a rule-based fallback."""

    normalized = (message or "").strip()
    if not normalized:
        return "neutral"

    heuristic = _heuristic_sentiment(normalized)

    agent_label = await _run_agent_sentiment(normalized)
    if agent_label:
        if heuristic.label != "neutral" and heuristic.label != agent_label:
            logger.debug(
                "Overriding agent sentiment '%s' with heuristic '%s' (confidence=%s) for text=%r",
                agent_label,
                heuristic.label,
                heuristic.confidence,
                normalized,
            )
            return heuristic.label
        return agent_label

    return heuristic.label


async def main() -> None:  # pragma: no cover - manual utility
    sentiment = await classify_sentiment("I am not very happy with the product.")
    print(sentiment)


if __name__ == "__main__":  # pragma: no cover - manual utility
    asyncio.run(main())
