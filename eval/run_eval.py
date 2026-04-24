import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", "config", ".env"))

from metrics import compute_metrics, print_report

DATASET_PATH = Path(__file__).parent / "dataset.json"
RESULTS_DIR = Path(__file__).parent / "results"
VIOLATION_DB_PATH = Path(__file__).parent.parent / "backend" / "data" / "violations.json"


def load_dataset(limit: int | None = None):
    with open(DATASET_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return data[:limit] if limit else data


def file_version(path: Path) -> dict:
    if not path.exists():
        return {"path": str(path), "exists": False}
    return {
        "path": str(path),
        "exists": True,
        "mtime": path.stat().st_mtime,
        "size": path.stat().st_size,
    }


def make_halluscan_predict(url: str, timeout: int):
    def predict(text: str) -> str:
        try:
            resp = requests.post(url, json={"text": text}, timeout=timeout)
            resp.raise_for_status()
            result = resp.json()
            verdict = (result.get("verdict") or {}).get("verdict", "")
            return "违规" if verdict in ("违规", "存疑") else "合规"
        except Exception as exc:
            print(f"  [HalluScan ERROR] {exc}")
            return "合规"

    return predict


def run_system(name: str, predict_fn, samples: list, delay: float = 0) -> dict:
    print(f"\n>>> Running {name} ({len(samples)} samples)...")
    labels, preds, details = [], [], []

    for i, sample in enumerate(samples, 1):
        text = sample["text"]
        label = sample["label"]
        pred = predict_fn(text)
        labels.append(label)
        preds.append(pred)
        correct = label == pred
        details.append({
            "id": sample["id"],
            "label": label,
            "pred": pred,
            "correct": correct,
            "text": text[:120],
        })
        status = "OK" if correct else "XX"
        print(f"  [{i:3d}/{len(samples)}] {status} label:{label} pred:{pred}  {text[:35]}...")
        if delay:
            time.sleep(delay)

    metrics = compute_metrics(labels, preds)
    failures = [d for d in details if not d["correct"]]
    return {"name": name, "metrics": metrics, "details": details, "failures": failures}


def save_results(results: list, timestamp: str, metadata: dict):
    RESULTS_DIR.mkdir(exist_ok=True)
    summary = {"timestamp": timestamp, "metadata": metadata, "systems": []}

    for result in results:
        fname = RESULTS_DIR / f"{result['name']}_{timestamp}.json"
        with open(fname, "w", encoding="utf-8") as f:
            json.dump({**result, "metadata": metadata}, f, ensure_ascii=False, indent=2)
        summary["systems"].append({"name": result["name"], "metrics": result["metrics"], "failures": result["failures"]})

    summary_path = RESULTS_DIR / f"summary_{timestamp}.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\nResults saved to {summary_path}")
    return summary_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Limit sample count")
    parser.add_argument("--systems", type=str, default="keyword,single_agent,halluscan",
                        help="Comma-separated systems: keyword,single_agent,halluscan")
    parser.add_argument("--halluscan-url", default=os.getenv("HALLUSCAN_EVAL_URL", "http://127.0.0.1:8000/scan"))
    parser.add_argument("--timeout", type=int, default=int(os.getenv("HALLUSCAN_EVAL_TIMEOUT", "120")))
    parser.add_argument("--delay", type=float, default=float(os.getenv("HALLUSCAN_EVAL_DELAY", "0")))
    args = parser.parse_args()

    systems = [s.strip() for s in args.systems.split(",") if s.strip()]
    samples = load_dataset(args.limit)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    metadata = {
        "dataset": file_version(DATASET_PATH),
        "violation_db": file_version(VIOLATION_DB_PATH),
        "llm_model": os.getenv("HALLUSCAN_LLM_MODEL", "qwen-plus"),
        "embedding_model": os.getenv("HALLUSCAN_EMBEDDING_MODEL", "text-embedding-v3"),
        "halluscan_url": args.halluscan_url,
        "systems": systems,
        "limit": args.limit,
    }

    print(f"Dataset: {len(samples)} samples (违规 {sum(s['label']=='违规' for s in samples)} / 合规 {sum(s['label']=='合规' for s in samples)})")
    print(f"Systems: {systems}")

    results = []
    if "keyword" in systems:
        from baseline_keyword import predict as keyword_predict

        result = run_system("baseline_keyword", keyword_predict, samples)
        results.append(result)
        print_report("Baseline 1: keyword", result["metrics"])

    if "single_agent" in systems:
        from baseline_single_agent import predict as single_agent_predict

        result = run_system("baseline_single_agent", single_agent_predict, samples, delay=args.delay)
        results.append(result)
        print_report("Baseline 2: single agent", result["metrics"])

    if "halluscan" in systems:
        predictor = make_halluscan_predict(args.halluscan_url, args.timeout)
        result = run_system("halluscan", predictor, samples, delay=args.delay)
        results.append(result)
        print_report("HalluScan: multi-agent", result["metrics"])

    if len(results) > 1:
        print(f"\n{'=' * 64}")
        print(f"  {'System':<22} {'Precision':>10} {'Recall':>8} {'F1':>8} {'Accuracy':>10}")
        print(f"  {'-' * 58}")
        for result in results:
            metrics = result["metrics"]
            print(f"  {result['name']:<22} {metrics['precision']:>10.4f} {metrics['recall']:>8.4f} {metrics['f1']:>8.4f} {metrics['accuracy']:>10.4f}")

    save_results(results, timestamp, metadata)


if __name__ == "__main__":
    main()
