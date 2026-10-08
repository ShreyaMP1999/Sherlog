"""Local-only demo server; tools remain read-only."""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .agent import investigate
from .tools import load_incidents

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
            return self.send(200, [{k: row[k] for k in ("id", "title", "service", "alert")}
                                   for row in load_incidents()])
        files = {"/": ("index.html", "text/html; charset=utf-8"),
                 "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                 "/style.css": ("style.css", "text/css; charset=utf-8")}
        if path in files:
            name, kind = files[path]
            return self.send(200, (WEB / name).read_bytes(), kind)
        self.send(404, {"error": "Not found"})

    def do_POST(self):
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
            if not isinstance(body, dict) or set(body) - {"incident", "mode"}:
                raise ValueError("Expected incident and optional mode")
            if not isinstance(body.get("incident"), str):
                raise ValueError("Incident must be a string")
            report = investigate(body["incident"], mode=body.get("mode", "offline"))
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
