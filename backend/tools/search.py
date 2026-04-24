import os

from tavily import TavilyClient

_client: TavilyClient | None = None


def _get_client() -> TavilyClient | None:
    global _client
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return None
    if _client is None:
        _client = TavilyClient(api_key=api_key)
    return _client


def search_claim(claim: str, max_results: int = 3) -> list[dict]:
    """Search a claim with Tavily. Fail closed to an empty evidence list."""
    client = _get_client()
    if client is None:
        return []

    try:
        results = client.search(
            claim,
            max_results=max_results,
            search_depth=os.getenv("TAVILY_SEARCH_DEPTH", "basic"),
        )
    except Exception as exc:
        print(f"[Search] Tavily failed for claim={claim!r}: {exc}")
        return []

    return [
        {
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": (r.get("content") or "")[:300],
        }
        for r in results.get("results", [])
    ]
