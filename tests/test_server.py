import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib import request
from urllib.error import HTTPError

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
        for path in ("/health", "/", "/app.js", "/style.css"):
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
