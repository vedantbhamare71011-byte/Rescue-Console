import argparse
import hmac
import json
import math
import mimetypes
import os
from pathlib import Path
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

WEB = Path(__file__).parent / "web"


def number(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError(name + " must be a number")
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(name + " out of range")
    return value


def validate(data):
    if not isinstance(data, dict):
        raise ValueError("Expected an object")
    position = data.get("position", {})
    attitude = data.get("attitude", {})
    if not isinstance(position, dict) or not isinstance(attitude, dict):
        raise ValueError("position and attitude must be objects")
    source = data.get("source", "")
    if not isinstance(source, str) or not 1 <= len(source) <= 64:
        raise ValueError("source must identify the telemetry producer (1-64 characters)")
    result = {
        "source": source,
        "position": {k: number(position.get(k), -10000, 10000, k) for k in ("east", "north", "up")},
        "attitude": {k: number(attitude.get(k, 0), -360, 360, k) for k in ("roll", "pitch", "yaw")},
        "battery": number(data.get("battery"), 0, 100, "battery") if data.get("battery") is not None else None,
        "speed": number(data.get("speed"), 0, 200, "speed") if data.get("speed") is not None else None,
    }
    return result


class State:
    def __init__(self):
        self.lock = threading.Lock()
        self.telemetry = None
        self.received = None
        self.frames = {}
        self.count = 0

    def snapshot(self):
        with self.lock:
            age = time.monotonic() - self.received if self.received is not None else None
            return {"telemetry": self.telemetry, "age": age, "connected": age is not None and age < 3,
                    "count": self.count, "frames": {k: time.monotonic() - v[1] for k, v in self.frames.items()}}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def reply(self, code, body, mime="application/json"):
        if not isinstance(body, bytes):
            body = json.dumps(body, allow_nan=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def allowed_host(self):
        host = self.headers.get("Host", "").split(":")[0].lower()
        return host in ("127.0.0.1", "localhost")

    def do_GET(self):
        if not self.allowed_host():
            return self.reply(403, {"error": "Local access only; use an SSH tunnel for remote producers"})
        path = urlsplit(self.path).path
        if path == "/api/state":
            return self.reply(200, self.server.state.snapshot())
        if path in ("/api/frame/rgb", "/api/frame/thermal"):
            with self.server.state.lock:
                frame = self.server.state.frames.get(path.rsplit("/", 1)[1])
            if not frame or time.monotonic() - frame[1] > 3:
                return self.reply(404, {"error": "No fresh frame"})
            return self.reply(200, frame[0], "image/jpeg")
        target = (WEB / (path.lstrip("/") or "index.html")).resolve()
        if not target.is_relative_to(WEB.resolve()) or not target.is_file():
            return self.reply(404, {"error": "Not found"})
        mime = "text/javascript" if target.suffix == ".js" else mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        return self.reply(200, target.read_bytes(), mime)

    def do_POST(self):
        if not self.allowed_host():
            return self.reply(403, {"error": "Local access only"})
        if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + self.server.token).encode()):
            return self.reply(401, {"error": "Producer token required"})
        path = urlsplit(self.path).path
        if path not in ("/api/telemetry", "/api/frame/rgb", "/api/frame/thermal"):
            return self.reply(404, {"error": "No hardware command endpoint exists"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            limit = 16384 if path == "/api/telemetry" else 2000000
            if not 0 < length <= 2000000:
                return self.reply(413, {"error": "Invalid payload size"})
            self.connection.settimeout(5)
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError("Incomplete payload")
            if length > limit:
                return self.reply(413, {"error": "Payload too large for this endpoint"})
            if path == "/api/telemetry":
                payload = validate(json.loads(body))
                with self.server.state.lock:
                    self.server.state.telemetry = payload
                    self.server.state.received = time.monotonic()
                    self.server.state.count += 1
            else:
                if not body.startswith(b"\xff\xd8\xff") or not body.endswith(b"\xff\xd9"):
                    raise ValueError("Expected a JPEG frame")
                with self.server.state.lock:
                    self.server.state.frames[path.rsplit("/", 1)[1]] = (body, time.monotonic())
            self.reply(200, {"accepted": True})
        except (ValueError, TypeError, UnicodeDecodeError, TimeoutError) as exc:
            self.reply(400, {"error": str(exc)})


def create_server(port=8787, token=None):
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.state = State()
    server.token = token or secrets.token_urlsafe(32)
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Local rescue dashboard. No physical flight commands.")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = create_server(args.port, os.environ.get("RESCUE_TOKEN"))
    print("Rescue Console: http://127.0.0.1:%d" % server.server_port, flush=True)
    print("Producer token (keep private): " + server.token, flush=True)
    print("Local-only. Demo is simulated; Realtime is read-only telemetry.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
