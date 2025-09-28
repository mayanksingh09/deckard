"""Avatar seed image generation helpers."""
from __future__ import annotations

from typing import Any, Dict


class ImageGenerationService:
    """Interfaces with the Responses API to generate avatar imagery."""

    async def create_avatar_seed(self, prompt: str, *, options: Dict[str, Any] | None = None) -> str:
        """Generate an avatar seed image and return a reference URI."""

        raise NotImplementedError("create_avatar_seed will call image generation tools")
