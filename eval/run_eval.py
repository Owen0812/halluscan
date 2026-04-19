"""
Phase 6 Evaluation Harness 主入口

用法：
  # 快速验证（前10条）
  python run_eval.py --limit 10

  # 只跑关键词基线（最快）
  python run_eval.py --limit 10 --systems keyword

  # 全量（100条，耗时约50分钟）
  python run_eval.py

  # 跳过 HalluScan（省API费用，先验证两个基线）
  python run_eval.py --limit 10 --systems keyword,single_agent
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import json
import time
import argparse
from datetime import datetime
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", "config", ".env"))

import requests
from metrics import compute_metrics, print_report
from baseline_keyword import predict as keyword_predict
from baseline_single_agent import predict as single_agent_predict

DATASET_PATH = os.path.join(os.path.dirname(__file__), "dataset.json")
RESULTS_DIR  = os.path.join(os.path.dirname(__file__), "results")
HALLUSCAN_URL = "http://127.0.0.1:8003/scan"


def load_dataset(limit: int = None):
    with open(DATASET_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return data[:limit] if limit else data


def halluscan_predict(text: str) -> str:
    try:
        resp = requests.post(HALLUSCAN_URL, json={"text": text}, timeout=120)
        resp.raise_for_status()
        result = resp.json()
        verdict = (result.get("verdict") or {}).get("verdict", "")
        # 后端可能返回 "违规"/"存疑"/"合规"，存疑视为违规（保守策略）
        return "违规" if verdict in ("违规", "存疑") else "合规"
    except Exception as e:
        print(f"  [HalluScan ERROR] {e}")
        return "合规"  # 降级为合规（最坏情况）


def run_system(name: str, predict_fn, samples: list, delay: float = 0) -> dict:
    print(f"\n>>> 运行 {name} ({len(samples)} 条)...")
    labels, preds, details = [], [], []

    for i, sample in enumerate(samples, 1):
        text  = sample["text"]
        label = sample["label"]
        pred  = predict_fn(text)
        labels.append(label)
        preds.append(pred)
        details.append({
            "id": sample["id"],
            "label": label,
            "pred": pred,
            "correct": label == pred,
            "text": text[:60] + "..." if len(text) > 60 else text,
        })
        status = "OK" if label == pred else "XX"
        print(f"  [{i:3d}/{len(samples)}] {status} label:{label} pred:{pred}  {text[:35]}...")
        if delay:
            time.sleep(delay)

    metrics = compute_metrics(labels, preds)
    return {"name": name, "metrics": metrics, "details": details}


def save_results(results: list, timestamp: str):
    os.makedirs(RESULTS_DIR, exist_ok=True)
    summary = {"timestamp": timestamp, "systems": []}

    for r in results:
        fname = os.path.join(RESULTS_DIR, f"{r['name']}_{timestamp}.json")
        with open(fname, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False, indent=2)
        summary["systems"].append({"name": r["name"], "metrics": r["metrics"]})

    summary_path = os.path.join(RESULTS_DIR, f"summary_{timestamp}.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n结果已保存至 {RESULTS_DIR}/")
    return summary_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="测试条数限制（默认全量）")
    parser.add_argument("--systems", type=str, default="keyword,single_agent,halluscan",
                        help="要运行的系统，逗号分隔：keyword,single_agent,halluscan")
    args = parser.parse_args()

    systems = [s.strip() for s in args.systems.split(",")]
    samples = load_dataset(args.limit)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"数据集：{len(samples)} 条（违规 {sum(s['label']=='违规' for s in samples)} / 合规 {sum(s['label']=='合规' for s in samples)}）")
    print(f"运行系统：{systems}")

    results = []

    if "keyword" in systems:
        r = run_system("baseline_keyword", keyword_predict, samples)
        results.append(r)
        print_report("Baseline 1：关键词匹配", r["metrics"])

    if "single_agent" in systems:
        r = run_system("baseline_single_agent", single_agent_predict, samples, delay=1)
        results.append(r)
        print_report("Baseline 2：单 Agent", r["metrics"])

    if "halluscan" in systems:
        r = run_system("halluscan", halluscan_predict, samples, delay=2)
        results.append(r)
        print_report("HalluScan：Multi-Agent", r["metrics"])

    if len(results) > 1:
        print(f"\n{'='*40}")
        print("  对比总结")
        print(f"{'='*40}")
        print(f"  {'系统':<22} {'Precision':>10} {'Recall':>8} {'F1':>8} {'Accuracy':>10}")
        print(f"  {'-'*58}")
        for r in results:
            m = r["metrics"]
            print(f"  {r['name']:<22} {m['precision']:>10.4f} {m['recall']:>8.4f} {m['f1']:>8.4f} {m['accuracy']:>10.4f}")

    save_results(results, timestamp)


if __name__ == "__main__":
    main()
