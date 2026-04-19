"""
Baseline 1：纯关键词匹配
直接复用 backend/tools/violation_db.py，有违规词 → 违规，否则 → 合规
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from tools.violation_db import check_violations


def predict(text: str) -> str:
    violations = check_violations(text)
    return "违规" if violations else "合规"


if __name__ == "__main__":
    samples = [
        "本品绝对是市面上最好的产品，效果第一无可替代",
        "这款面霜质地轻薄，适合混合型肌肤日常使用",
    ]
    for s in samples:
        print(f"[{predict(s)}] {s[:40]}...")
