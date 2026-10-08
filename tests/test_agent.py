import unittest
from unittest.mock import patch

from sherlog.agent import investigate
from sherlog.planner import OllamaPlanner, rule_plan, validate_plan
from sherlog.report import validate_report
from sherlog.tools import IncidentTools, get_incident


class AgentTests(unittest.TestCase):
    def test_pool_diagnosis_has_independent_evidence(self):
        report = investigate("checkout-pool")
        self.assertEqual(report["cause"], "db_pool_exhaustion")
        self.assertEqual(set(report["citations"]), {"L1", "M:db_pool_utilization_pct", "R1"})
        self.assertEqual(report["tool_calls"], 4)

    def test_metric_counterfactual_changes_diagnosis(self):
        incident = get_incident("checkout-pool")
        incident["metrics"]["db_pool_utilization_pct"] = [35, 40]
        report = investigate("checkout-pool", tools=IncidentTools(incident))
        self.assertEqual(report["cause"], "unknown")

    def test_ambiguous_signals_do_not_pick_a_winner(self):
        report = investigate("ambiguous")
        self.assertEqual(report["status"], "ambiguous")
        self.assertEqual(len(report["candidates"]), 2)
        self.assertEqual(report["cause"], "unknown")

    def test_budget_exhaustion_produces_incomplete_report(self):
        report = investigate("checkout-pool", budget=2)
        self.assertEqual(report["tool_calls"], 2)
        self.assertEqual(report["status"], "inconclusive")

    def test_timeout_is_recorded_and_bounded(self):
        class BrokenTools(IncidentTools):
            def inspect_metrics(self):
                raise TimeoutError("metrics unavailable")
        report = investigate("checkout-pool", tools=BrokenTools(get_incident("checkout-pool")))
        self.assertEqual(report["tool_calls"], 6)
        self.assertEqual(report["cause"], "unknown")
        self.assertTrue(any(not step["ok"] for step in report["trace"]))

    def test_repeated_tools_cannot_overwrite_evidence(self):
        def stuck(state):
            return {"tool": "search_logs", "arguments": {}, "reason": "Read logs"}
        report = investigate("checkout-pool", planner=stuck)
        self.assertEqual(report["tool_calls"], 6)
        self.assertEqual(sum(step["ok"] for step in report["trace"]), 1)
        self.assertEqual(report["cause"], "unknown")

    def test_info_level_injection_does_not_become_a_cause(self):
        self.assertEqual(investigate("injection")["cause"], "upstream_outage")

    def test_stale_release_does_not_support_rollback(self):
        report = investigate("stale-deploy")
        self.assertEqual(report["cause"], "unknown")
        self.assertFalse(any("rollback" in action for action in report["actions"]))

    def test_early_finish_abstains(self):
        report = investigate("checkout-pool", planner=lambda state: {
            "tool": "finish", "arguments": {}, "reason": "No evidence"})
        self.assertEqual(report["cause"], "unknown")
        self.assertEqual(report["tool_calls"], 0)

    def test_fabricated_citation_rejected(self):
        report = investigate("checkout-pool")
        report["citations"].append("FAKE")
        with self.assertRaises(ValueError):
            validate_report(report)

    def test_unknown_tool_and_extra_arguments_rejected(self):
        for plan in [{"tool": "shell", "arguments": {}, "reason": "No"},
                     {"tool": "inspect_metrics", "arguments": {"service": "other"}, "reason": "No"}]:
            with self.assertRaises(ValueError):
                validate_plan(plan)

    def test_invalid_budget_and_incident_rejected(self):
        for budget in [0, 13]:
            with self.assertRaises(ValueError):
                investigate("checkout-pool", budget=budget)
        with self.assertRaises(ValueError):
            investigate("not-an-incident")

    def test_tool_output_does_not_mutate_fixtures(self):
        tools = IncidentTools(get_incident("checkout-pool"))
        tools.search_logs()[0]["message"] = "modified"
        self.assertNotEqual(tools.search_logs()[0]["message"], "modified")

    def test_ollama_transport_and_json_contract(self):
        import json
        from io import BytesIO
        state = {"alert": "Investigate", "observations": {}, "trace": [], "budget": 6}
        decision = rule_plan(state)
        response = BytesIO(json.dumps({"message": {"content": json.dumps(decision)}}).encode())
        with patch("sherlog.planner.request.urlopen", return_value=response) as transport:
            self.assertEqual(OllamaPlanner()(state), decision)
            body = json.loads(transport.call_args.args[0].data)
            self.assertEqual(body["stream"], False)
            self.assertIn("tool", body["format"]["properties"])

    def test_ollama_connection_failure_is_explicit(self):
        from urllib.error import URLError
        with patch("sherlog.planner.request.urlopen", side_effect=URLError("offline")):
            with self.assertRaisesRegex(RuntimeError, "Ollama planning failed"):
                OllamaPlanner()({"alert": "Investigate", "observations": {}, "trace": [], "budget": 6})


if __name__ == "__main__":
    unittest.main()
