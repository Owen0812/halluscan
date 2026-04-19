"""
Precision / Recall / F1 计算工具
正类 = 违规，负类 = 合规
"""
from typing import List


def compute_metrics(labels: List[str], preds: List[str]) -> dict:
    tp = sum(l == "违规" and p == "违规" for l, p in zip(labels, preds))
    fp = sum(l == "合规" and p == "违规" for l, p in zip(labels, preds))
    fn = sum(l == "违规" and p == "合规" for l, p in zip(labels, preds))
    tn = sum(l == "合规" and p == "合规" for l, p in zip(labels, preds))

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy  = (tp + tn) / len(labels) if labels else 0.0

    return {
        "precision": round(precision, 4),
        "recall":    round(recall, 4),
        "f1":        round(f1, 4),
        "accuracy":  round(accuracy, 4),
        "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        "total": len(labels),
    }


def print_report(name: str, metrics: dict):
    print(f"\n{'='*40}")
    print(f"  {name}")
    print(f"{'='*40}")
    print(f"  Precision : {metrics['precision']:.4f}")
    print(f"  Recall    : {metrics['recall']:.4f}")
    print(f"  F1        : {metrics['f1']:.4f}")
    print(f"  Accuracy  : {metrics['accuracy']:.4f}")
    print(f"  TP={metrics['tp']} FP={metrics['fp']} FN={metrics['fn']} TN={metrics['tn']}")
    print(f"  Total     : {metrics['total']} samples")
