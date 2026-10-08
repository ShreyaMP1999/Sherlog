"""Bounded LangGraph plan -> tool -> plan loop, then evidence verification."""

import time
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from .planner import OllamaPlanner, rule_plan, validate_plan
from .report import build_report
from .tools import IncidentTools, get_incident


class InvestigationState(TypedDict):
    incident_id: str
    alert: str
    mode: str
    budget: int
    plan: dict
    observations: dict
    trace: list[dict]
    report: dict


def investigate(incident_id: str, mode: str = "offline", budget: int = 6,
                *, planner=None, tools=None) -> dict:
    if mode not in ("offline", "ollama"):
        raise ValueError("Mode must be offline or ollama")
    if not isinstance(budget, int) or not 1 <= budget <= 12:
        raise ValueError("Tool budget must be between 1 and 12")
    incident = get_incident(incident_id)
    tools = tools or IncidentTools(incident)
    planner = planner or (rule_plan if mode == "offline" else OllamaPlanner())

    def plan(state):
        if len(state["trace"]) >= state["budget"]:
            return {"plan": {"tool": "finish", "arguments": {}, "reason": "Tool budget reached."}}
        decision = planner(state)
        validate_plan(decision)
        return {"plan": decision}

    def execute(state):
        decision = state["plan"]
        name = decision["tool"]
        started = time.perf_counter()
        observations = dict(state["observations"])
        step = {**decision, "ok": True}
        try:
            if name in observations:
                raise ValueError("Repeated successful tool call rejected")
            rows = tools.execute(name, decision["arguments"])
            observations[name] = rows
            step["records"] = len(rows)
        except (ValueError, OSError, TimeoutError) as exc:
            step.update(ok=False, error=str(exc), records=0)
        step["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
        return {"observations": observations, "trace": [*state["trace"], step]}

    graph = StateGraph(InvestigationState)
    graph.add_node("plan", plan)
    graph.add_node("tool", execute)
    graph.add_node("verify", lambda state: {"report": build_report(state)})
    graph.add_edge(START, "plan")
    graph.add_conditional_edges("plan", lambda state: "verify" if state["plan"]["tool"] == "finish"
                                else "tool", {"tool": "tool", "verify": "verify"})
    graph.add_edge("tool", "plan")
    graph.add_edge("verify", END)
    started = time.perf_counter()
    result = graph.compile().invoke({"incident_id": incident_id, "alert": incident["alert"],
        "mode": mode, "budget": budget, "observations": {}, "trace": []},
        config={"recursion_limit": 2 * budget + 5})
    report = result["report"]
    report["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
    return report
