"""Ground every diagnosis in retrieved log, metric and runbook evidence."""

from .tools import TOOL_NAMES


def build_report(state: dict) -> dict:
    observations = state["observations"]
    evidence = [dict(row, source=name) for name, rows in observations.items() for row in rows]
    base = {"incident_id": state["incident_id"], "alert": state["alert"],
            "mode": state["mode"], "tool_calls": len(state["trace"]),
            "trace": state["trace"], "evidence": evidence, "candidates": [],
            "cause": "unknown", "status": "inconclusive", "support": "insufficient",
            "citations": [], "actions": ["Collect missing evidence and involve the incident owner."],
            "summary": "The available evidence does not support a specific cause.",
            "limitations": "Synthetic snapshot; support strength is not a calibrated probability. "
                           "Suggested actions require review; Sherlog makes no production changes."}
    if not all(name in observations for name in TOOL_NAMES):
        base["summary"] = "Investigation incomplete: one or more evidence tools did not succeed."
        return base
    logs = observations["search_logs"]
    metrics = {row["name"]: row for row in observations["inspect_metrics"]}
    recent = [row for row in observations["deployment_history"]
              if 0 <= row["minutes_before_alert"] <= 30]
    candidates = []
    for book in observations["search_runbooks"]:
        matching = [row for row in logs if row["level"] in ("ERROR", "WARN")
                    and any(pattern in row["message"].lower() for pattern in book["log_patterns"])]
        metric = metrics.get(book["metric"])
        corroborated = (matching and metric and metric["after"] >= book["threshold"]
                        and metric["after"] > metric["before"]
                        and (not book["requires_recent_change"] or recent))
        if corroborated:
            citations = [matching[0]["id"], metric["id"], book["id"]]
            if book["requires_recent_change"]:
                citations.append(recent[0]["id"])
            candidates.append({"cause": book["cause"], "title": book["title"],
                               "citations": citations, "actions": book["actions"]})
    base["candidates"] = candidates
    if len(candidates) == 1:
        candidate = candidates[0]
        base.update(cause=candidate["cause"], status="diagnosed", support="corroborated",
                    summary=f"Leading hypothesis: {candidate['title']}. Independent signals agree; "
                            "verify with the service owner before remediation.",
                    citations=candidate["citations"], actions=candidate["actions"])
    elif len(candidates) > 1:
        base.update(status="ambiguous", support="conflicting",
                    summary="Multiple failure mechanisms are supported. The snapshot cannot "
                            "establish which caused the incident first.",
                    citations=list(dict.fromkeys(c for item in candidates for c in item["citations"])),
                    actions=["Correlate request traces and event timestamps to separate the failures.",
                             "Escalate both supported hypotheses to their service owners."])
    elif (logs and metrics.get("error_rate_pct", {}).get("after", 100) < 1
          and not any(row["level"] == "ERROR" for row in logs)):
        base.update(cause="healthy", status="healthy", support="limited",
                    summary="No active failure is visible in this snapshot; the earlier alert "
                            "still requires historical investigation.",
                    citations=["M:error_rate_pct", logs[0]["id"]],
                    actions=["Check the earlier alert window before closing the incident."])
    validate_report(base)
    return base


def validate_report(report: dict) -> None:
    known = {row["id"] for row in report["evidence"]}
    references = report["citations"] + [ref for candidate in report["candidates"]
                                        for ref in candidate["citations"]]
    if not set(references) <= known:
        raise ValueError("Report contains an unobserved evidence citation")


def markdown(report: dict) -> str:
    lines = [f"# Sherlog: {report['incident_id']}", "", report["summary"], "",
             f"- Status: {report['status']}", f"- Cause: {report['cause']}",
             f"- Evidence support: {report['support']}", f"- Mode: {report['mode']}",
             f"- Tool calls: {report['tool_calls']}", "", "## Evidence", ""]
    cited = set(report["citations"])
    for row in report["evidence"]:
        if row["id"] in cited:
            content = row.get("message", row.get("description", row.get("title", "")))
            if "after" in row:
                content = f"{row['name']}: {row['before']} -> {row['after']}"
            lines.append(f"- [{row['id']}] {content}")
    lines += ["", "## Suggested Next Steps", ""]
    lines += [f"{i}. {action}" for i, action in enumerate(report["actions"], 1)]
    lines += ["", "## Tool Trace", ""]
    lines += [f"{i}. {step['tool']} | {'ok' if step['ok'] else 'failed'} | "
              f"{step['duration_ms']} ms | {step['reason']}"
              for i, step in enumerate(report["trace"], 1)]
    lines += ["", report["limitations"], ""]
    return "\n".join(lines)
