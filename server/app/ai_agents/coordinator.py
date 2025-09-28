"""Coordinator agent skeleton using openai-agents runtime."""
from __future__ import annotations

from typing import Any, Dict


class CoordinatorAgent:
    """Selects downstream agents or tools based on session intent."""

    def __init__(self) -> None:
        # TODO: inject tool registry and runtime once available.
        self._runtime = None

    async def classify_intent(self, prompt: str) -> Dict[str, Any]:
        """Determine which workflow to execute for the given prompt."""

        raise NotImplementedError("classify_intent will leverage openai-agents")

    async def run(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the selected workflow and return summary output."""

        raise NotImplementedError("run will orchestrate tool execution via runtime")
