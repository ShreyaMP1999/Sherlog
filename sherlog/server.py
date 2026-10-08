"""Local-only demo server; tools remain read-only."""

import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib import request
from urllib.error import URLError

from .agent import investigate
from .tools import DATA, load_incidents, load_runbooks

WEB = Path(__file__).parent / "web"


class Handler(BaseHTTPRequestHandler):
    def send(self, status, content, content_type="application/json"):
        body = content if isinstance(content, bytes) else json.dumps(content).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; "
                         "script-src 'self'; img-src 'self' data:; object-src 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/health":
            return self.send(200, {"status": "ok"})
        if path == "/api/incidents":
            return self.send(200, [{**{k: row[k] for k in ("id", "title", "service", "alert", "metrics")},
                                   "logs_count": len(row["logs"]), "changes_count": len(row["changes"])}
                                  for row in load_incidents()])
        if path == "/api/runbooks":
            return self.send(200, load_runbooks())
        if path == "/api/evaluation":
            return self.send(200, json.loads((DATA / "evaluation.json").read_text()))
        if path == "/api/model-status":
            host = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
            model = os.getenv("SHERLOG_MODEL", "qwen3:4b")
            try:
                with request.urlopen(host + "/api/tags", timeout=2) as response:
                    payload = json.load(response)
                models = [row["name"] for row in payload.get("models", [])]
                return self.send(200, {"status": "ready" if model in models else "model_missing",
                                       "model": model, "endpoint": host, "models": models})
            except (URLError, TimeoutError, ValueError, KeyError, TypeError, AttributeError):
                return self.send(200, {"status": "unavailable", "model": model,
                                       "endpoint": host, "models": []})
        files = {"/": ("index.html", "text/html; charset=utf-8"),
                 "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                 "/lucide.min.js": ("lucide.min.js", "text/javascript; charset=utf-8"),
                 "/style.css": ("style.css", "text/css; charset=utf-8")}
        if path in files:
            name, kind = files[path]
            return self.send(200, (WEB / name).read_bytes(), kind)
        self.send(404, {"error": "Not found"})

    def do_POST(self):
        if urlsplit(self.path).path == "/api/evaluate":
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                return self.send(403, {"error": "Cross-origin requests are not allowed"})
            from evals.run import evaluate
            result = evaluate("offline")
            result["evaluated_at"] = datetime.now(timezone.utc).isoformat()
            result["provenance"] = "Live offline evaluation"
            return self.send(200, result)
        if urlsplit(self.path).path != "/api/investigate":
            return self.send(404, {"error": "Not found"})
        # Reject cross-origin browser requests to the local demo.
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{self.headers.get('Host')}":
            return self.send(403, {"error": "Cross-origin requests are not allowed"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise ValueError("Request body must be between 1 and 4096 bytes")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict) or set(body) - {"incident", "mode", "budget"}:
                raise ValueError("Expected incident and optional mode")
            if not isinstance(body.get("incident"), str):
                raise ValueError("Incident must be a string")
            report = investigate(body["incident"], mode=body.get("mode", "offline"),
                                 budget=body.get("budget", 6))
        except (ValueError, UnicodeDecodeError) as exc:
            return self.send(400, {"error": str(exc)})
        except RuntimeError as exc:
            return self.send(503, {"error": str(exc)})
        self.send(200, report)


def serve(port: int = 8765):
    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(f"Sherlog demo: http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
