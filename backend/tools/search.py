import os
from tavily import TavilyClient

_client: TavilyClient | None = None


def _get_client() -> TavilyClient:
    global _client
    if _client is None:
        _client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY", ""))
    return _client


def search_claim(claim: str, max_results: int = 3) -> list[dict]:
    """用 Tavily 搜索某条声明，返回相关结果摘要列表。"""
    results = _get_client().search(claim, max_results=max_results)
    return [
        {"title": r["title"], "url": r["url"], "content": r["content"][:300]}
        for r in results.get("results", [])
    ]
