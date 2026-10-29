import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from sherlog.cli import main


class CliTests(unittest.TestCase):
    def test_json_export_creates_parent_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "report.json"
            stdout = io.StringIO()
            with patch("sys.argv", ["sherlog", "investigate", "checkout-pool",
                                    "--format", "json", "--output", str(output)]), redirect_stdout(stdout):
                main()
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["cause"], "db_pool_exhaustion")
            self.assertEqual(json.loads(stdout.getvalue()), report)

    def test_export_errors_have_actionable_messages(self):
        for operation in ("mkdir", "write_text"):
            stderr = io.StringIO()
            with self.subTest(operation=operation), patch(
                "sys.argv", ["sherlog", "investigate", "--output", "report.json"]
            ), patch(f"sherlog.cli.Path.{operation}", side_effect=PermissionError("Access denied")), \
                    redirect_stderr(stderr), redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as error:
                    main()
            self.assertEqual(error.exception.code, 2)
            self.assertIn("Cannot write report to report.json", stderr.getvalue())
            self.assertIn("Access denied", stderr.getvalue())
            self.assertNotIn("Traceback", stderr.getvalue())
