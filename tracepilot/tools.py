"""Read-only, incident-scoped tools. Evaluation labels never enter this module."""

import copy
import json
import re
from pathlib import Path

DATA = Path(__file__).parent / "data"
TOOL_NAMES = ("search_logs", "inspect_metrics", "deployment_history", "search_runbooks")


def load_incidents() -> list[dict]:
    return json.loads((DATA / "incidents.json").read_text())


def get_incident(incident_id: str) -> dict:
    for incident in load_incidents():
        if incident["id"] == incident_id:
            return incident
    raise ValueError(f"Unknown incident: {incident_id}")


class IncidentTools:
    def __init__(self, incident: dict):
        self.incident = copy.deepcopy(incident)

    def execute(self, name: str, arguments: dict) -> list[dict]:
        if name not in TOOL_NAMES:
            raise ValueError(f"Tool is not allowed: {name}")
        allowed = {"query"} if name in ("search_logs", "search_runbooks") else set()
        if set(arguments) - allowed:
            raise ValueError("Unexpected tool arguments")
        query = arguments.get("query", "")
        if not isinstance(query, str) or len(query) > 2000:
            raise ValueError("Query must be a string of at most 2000 characters")
        return getattr(self, name)(**arguments)

    def search_logs(self, query: str = "") -> list[dict]:
        terms = set(re.findall(r"\w+", query.lower()))
        return [copy.deepcopy(row) for row in self.incident["logs"]
                if not terms or terms & set(re.findall(r"\w+", row["message"].lower()))]

    def inspect_metrics(self) -> list[dict]:
        return [{"id": f"M:{name}", "name": name, "before": values[0],
                 "after": values[1]} for name, values in self.incident["metrics"].items()]

    def deployment_history(self) -> list[dict]:
        return copy.deepcopy(self.incident["changes"])

    def search_runbooks(self, query: str = "") -> list[dict]:
        terms = set(re.findall(r"\w+", query.lower()))
        books = json.loads((DATA / "runbooks.json").read_text())
        ranked = [(len(terms & set(book["keywords"])), book) for book in books]
        return [book for score, book in sorted(ranked, key=lambda row: -row[0])
                if not terms or score > 0]
