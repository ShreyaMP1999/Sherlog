"""Compare a log-only baseline with the evidence-gated graph on labeled fixtures."""

import argparse
import json
import statistics
from pathlib import Path

from tracepilot.agent import investigate
from tracepilot.report import validate_report
from tracepilot.tools import get_incident


def log_only_baseline(incident: dict) -> str:
    text = " ".join(row["message"].lower() for row in incident["logs"])
    for needle, cause in [("connection acquisition timed out", "db_pool_exhaustion"),
                           ("payment provider", "upstream_outage"),
                           ("schema mismatch", "deployment_regression"),
                           ("memory allocation failed", "memory_pressure")]:
        if needle in text:
            return cause
    return "unknown"


def evaluate(mode: str = "offline") -> dict:
    cases = json.loads(Path(__file__).with_name("cases.json").read_text())
    rows = []
    for case in cases:
        report = investigate(case["incident"], mode=mode)
        validate_report(report)
        rows.append({"incident": case["incident"], "expected": case["cause"],
                     "actual": report["cause"], "status": report["status"],
                     "pass": report["cause"] == case["cause"] and report["status"] == case["status"],
                     "baseline_correct": log_only_baseline(get_incident(case["incident"])) == case["cause"],
                     "citations_valid": set(report["citations"]) <= {r["id"] for r in report["evidence"]},
                     "within_budget": report["tool_calls"] <= 6,
                     "tool_calls": report["tool_calls"], "duration_ms": report["duration_ms"]})
    return {"mode": mode, "dataset": "12 hand-authored synthetic regression cases",
            "limitations": "Public development fixtures, not a held-out production benchmark. "
                           "Offline results do not establish language-model performance.",
            "cases": len(rows), "passed": sum(row["pass"] for row in rows),
            "cause_accuracy": sum(row["actual"] == row["expected"] for row in rows) / len(rows),
            "baseline_cause_accuracy": sum(row["baseline_correct"] for row in rows) / len(rows),
            "citation_validity": sum(row["citations_valid"] for row in rows) / len(rows),
            "budget_compliance": sum(row["within_budget"] for row in rows) / len(rows),
            "mean_tool_calls": statistics.mean(row["tool_calls"] for row in rows),
            "median_duration_ms": statistics.median(row["duration_ms"] for row in rows), "results": rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["offline", "ollama"], default="offline")
    parser.add_argument("--output", type=Path, default=Path("artifacts/eval-results.json"))
    args = parser.parse_args()
    result = evaluate(args.mode)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    if result["passed"] != result["cases"] or result["budget_compliance"] != 1:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
