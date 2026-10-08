import json
import io
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib import request
from urllib.error import HTTPError
from unittest.mock import patch

from sherlog.server import Handler


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, data, headers=None):
        req = request.Request(self.base + "/api/investigate", data=json.dumps(data).encode(),
                              headers=headers or {"Content-Type": "application/json"})
        return request.urlopen(req)

    def test_health_and_static_assets(self):
        for path in ("/health", "/", "/app.js", "/style.css", "/lucide.min.js"):
            with request.urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200)
                self.assertGreater(len(response.read()), 10)

    def test_full_investigation_endpoint(self):
        with self.post({"incident": "checkout-pool"}) as response:
            self.assertEqual(json.load(response)["cause"], "db_pool_exhaustion")

    def test_invalid_request_returns_400(self):
        for body in ({"incident": "missing"}, {"incident": "checkout-pool", "mode": "bad"}, []):
            with self.assertRaises(HTTPError) as error:
                self.post(body)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()

    def test_cross_origin_post_rejected(self):
        with self.assertRaises(HTTPError) as error:
            self.post({"incident": "checkout-pool"}, {"Origin": "https://example.com"})
        self.assertEqual(error.exception.code, 403)
        error.exception.close()

    def test_unknown_route_is_not_a_file_server(self):
        with self.assertRaises(HTTPError) as error:
            request.urlopen(self.base + "/pyproject.toml")
        self.assertEqual(error.exception.code, 404)
        error.exception.close()

    def test_workspace_data_endpoints(self):
        with request.urlopen(self.base + "/api/incidents") as response:
            cases = json.load(response)
        self.assertEqual(len(cases), 12)
        self.assertIn("metrics", cases[0])
        self.assertNotIn("cause", cases[0])
        with request.urlopen(self.base + "/api/runbooks") as response:
            self.assertEqual(len(json.load(response)), 4)
        with request.urlopen(self.base + "/api/evaluation") as response:
            self.assertEqual(json.load(response)["passed"], 12)

    def test_live_evaluation_endpoint(self):
        req = request.Request(self.base + "/api/evaluate", data=b"{}")
        with request.urlopen(req) as response:
            result = json.load(response)
        self.assertEqual(result["passed"], 12)
        self.assertEqual(result["mode"], "offline")
        self.assertIn("evaluated_at", result)

    def test_custom_budget_endpoint(self):
        with self.post({"incident": "checkout-pool", "budget": 2}) as response:
            report = json.load(response)
        self.assertEqual(report["budget"], 2)
        self.assertLessEqual(report["tool_calls"], 2)

    def test_model_status_ready_and_missing(self):
        # Call the handler directly so the mocked transport cannot intercept the test client.
        handler = object.__new__(Handler)
        handler.path = "/api/model-status"
        captured = []
        handler.send = lambda status, payload: captured.append(payload)
        for model, status in (("qwen3:4b", "ready"), ("other:latest", "model_missing")):
            with patch.dict("os.environ", {"SHERLOG_MODEL": "qwen3:4b"}), patch(
                "sherlog.server.request.urlopen", return_value=io.BytesIO(
                    json.dumps({"models": [{"name": model}]}).encode())
            ):
                handler.do_GET()
            self.assertEqual(captured[-1]["status"], status)

    def test_evaluation_rejects_cross_origin(self):
        req = request.Request(self.base + "/api/evaluate", data=b"{}",
                              headers={"Origin": "https://example.com"})
        with self.assertRaises(HTTPError) as error:
            request.urlopen(req)
        self.assertEqual(error.exception.code, 403)
        error.exception.close()
