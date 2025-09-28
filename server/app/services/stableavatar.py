"""StableAvatar RunPod client abstraction."""
from __future__ import annotations

from typing import Any, Dict


class StableAvatarClient:
    """Encapsulates HTTP calls to the RunPod StableAvatar deployment."""

    async def submit_job(self, *, audio_url: str, image_url: str, session_id: str) -> str:
        """Submit a new lipsync generation job and return the job identifier."""

        raise NotImplementedError("submit_job will call the RunPod endpoint")

    async def poll_job(self, job_id: str) -> Dict[str, Any]:
        """Poll RunPod for job completion details."""

        raise NotImplementedError("poll_job will retrieve job status from RunPod")
