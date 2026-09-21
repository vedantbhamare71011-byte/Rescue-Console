"""Forward newline-delimited ENU telemetry from stdin to the local dashboard."""
import argparse
import json
import os
import sys
import urllib.request
from server import validate

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    token = os.environ.get("RESCUE_TOKEN")
    if not token:
        sys.exit("Set RESCUE_TOKEN to the producer token printed by server.py.")
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            payload = validate(json.loads(line))
            request = urllib.request.Request(
                "http://127.0.0.1:%d/api/telemetry" % args.port,
                data=json.dumps(payload).encode(),
                headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=3) as response:
                response.read()
        except (ValueError, OSError) as error:
            print("Telemetry rejected: " + str(error), file=sys.stderr)
