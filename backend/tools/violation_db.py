import json
import re
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent / "data" / "violations.json"
_db: dict = {}

SAFE_CONTEXT_PATTERNS = [
    re.compile(r"100%\s*(纯棉|全棉|棉|棉质|羊毛|真丝|全麦|天然原料|可回收|材质)"),
    re.compile(r"(含量|净含量|容量|重量|规格|尺寸|长度|宽度|高度|pH值|PH值|浓度)\s*(约)?\s*\d+(\.\d+)?\s*(%|mg|g|kg|ml|L|cm|mm|m)"),
    re.compile(r"适合.{0,12}(人群|肤质|年龄|儿童|成人|干性肌肤|油性肌肤|混合肌肤)"),
    re.compile(r"(建议|推荐).{0,8}(使用|食用|搭配|清洗|保存)"),
]


def _load():
    global _db
    if not _db:
        with open(_DB_PATH, encoding="utf-8") as f:
            _db = json.load(f)


def check_violations(text: str) -> list[dict]:
    """Scan text and return violation dictionary hits after lightweight context filtering."""
    _load()
    found = []

    for category, meta in _db.items():
        for word in meta.get("words", []):
            if word in text and not _is_safe_context(text, word, category):
                found.append({
                    "word": word,
                    "category": category,
                    "description": meta["description"],
                    "law": meta["law"],
                    "risk": meta["risk"],
                })

        for pattern in meta.get("patterns", []):
            for match in re.finditer(pattern, text):
                word = match.group()
                if not _is_safe_context(text, word, category):
                    found.append({
                        "word": word,
                        "category": category,
                        "description": meta["description"],
                        "law": meta["law"],
                        "risk": meta["risk"],
                    })

    return found


def _is_safe_context(text: str, word: str, category: str) -> bool:
    """Filter common false positives such as material/specification descriptions."""
    if category not in {"absolute_words", "false_data", "efficacy_claims"}:
        return False

    idx = text.find(word)
    window = text if idx < 0 else text[max(0, idx - 18): idx + len(word) + 18]
    if any(pattern.search(window) for pattern in SAFE_CONTEXT_PATTERNS):
        return True

    if word == "100%" and re.search(r"100%\s*(纯|全|天然|棉|羊毛|真丝|材质|成分)", window):
        return True

    return False
