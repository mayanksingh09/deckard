"""Web search integration via OpenAI Responses API."""
from __future__ import annotations

from typing import Any, Dict, List


class WebSearchService:
    """Executes web search queries and prepares summaries for downstream agents."""

    async def search(self, query: str, *, options: Dict[str, Any] | None = None) -> List[Dict[str, Any]]:
        """Perform a web search and return structured results."""

        raise NotImplementedError("search will call the Responses API with web_search tool")

    async def summarize(self, results: List[Dict[str, Any]]) -> str:
        """Generate a spoken narrative summary based on search results."""

        raise NotImplementedError("summarize will orchestrate TTS output")
