"""Agent responsible for avatar seed generation."""
from __future__ import annotations

from typing import Any, Dict


class AvatarSeedAgent:
    """Generate avatar imagery based on the initial user prompt."""

    def __init__(self) -> None:
        # TODO: inject ImageGenerationService dependency.
        self._image_service = None

    async def handle(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Produce avatar seed output for downstream lipsync."""

        raise NotImplementedError("handle will coordinate with ImageGenerationService")
