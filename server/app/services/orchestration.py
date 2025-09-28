"""High-level orchestration service coordinating agents and tools."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class OrchestrationContext:
    """Placeholder structure capturing the context for a session run."""

    session_id: str
    metadata: Dict[str, Any]


class OrchestrationService:
    """Facade that will invoke the appropriate agents based on session intent."""

    async def create_session(self, request: Dict[str, Any]) -> OrchestrationContext:
        """Initialize a new orchestration session."""

        raise NotImplementedError("create_session will allocate agent pipelines")

    async def run_session(self, context: OrchestrationContext) -> None:
        """Execute the orchestration workflow for the given context."""

        raise NotImplementedError("run_session will orchestrate agent execution")
