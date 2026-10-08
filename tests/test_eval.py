import unittest

from evals.run import evaluate


class EvaluationTests(unittest.TestCase):
    def test_regression_suite_and_baseline(self):
        result = evaluate()
        self.assertEqual(result["passed"], 12)
        self.assertEqual(result["citation_validity"], 1)
        self.assertEqual(result["budget_compliance"], 1)
        self.assertGreater(result["cause_accuracy"], result["baseline_cause_accuracy"])
