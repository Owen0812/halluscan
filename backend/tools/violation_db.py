import json
import re
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent / "data" / "violations.json"
_db: dict = {}


def _load():
    global _db
    if not _db:
        with open(_DB_PATH, encoding="utf-8") as f:
            _db = json.load(f)


def check_violations(text: str) -> list[dict]:
    """扫描文本，返回命中的违规条目列表。"""
    _load()
    found = []

    for category, meta in _db.items():
        for word in meta.get("words", []):
            if word in text:
                found.append({
                    "word": word,
                    "category": category,
                    "description": meta["description"],
                    "law": meta["law"],
                    "risk": meta["risk"],
                })

        for pattern in meta.get("patterns", []):
            for match in re.finditer(pattern, text):
                found.append({
                    "word": match.group(),
                    "category": category,
                    "description": meta["description"],
                    "law": meta["law"],
                    "risk": meta["risk"],
                })

    return found
