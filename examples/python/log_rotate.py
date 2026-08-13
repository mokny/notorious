#!/usr/bin/env python3
"""
Notorious API - Log rotation example (Python stdlib only).

Appends a new paragraph block at the bottom of an object, and - if that
pushes the block count above MAX_LINES - deletes the oldest (topmost)
block. Treats every block in the target object as one log line, so point
OBJECT_ID at an object you use only for this log.

Usage:
    python log_rotate.py "some log line"
"""

import json
import sys
import urllib.error
import urllib.request

API_URL = "http://localhost:4000"
API_TOKEN = "ntr_your_api_token_here"
OBJECT_ID = "your-object-id"
MAX_LINES = 20


def request_json(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{API_URL}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            if response.status == 204:
                return None
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        body_text = json.loads(error.read())
        raise SystemExit(f"Request failed ({error.code}): {body_text.get('message')}")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: python {sys.argv[0]} <log line>")
    line = sys.argv[1]

    blocks = request_json("GET", f"/api/v1/objects/{OBJECT_ID}/blocks")
    last_block_id = blocks[-1]["id"] if blocks else None

    request_json(
        "POST",
        "/api/v1/blocks",
        {
            "objectId": OBJECT_ID,
            "type": "paragraph",
            "content": {"markdown": line},
            "afterBlockId": last_block_id,
        },
    )
    print(f"Appended: {line}")

    excess = max(0, (len(blocks) + 1) - MAX_LINES)
    for oldest in blocks[:excess]:
        request_json("DELETE", f"/api/v1/blocks/{oldest['id']}")
        print(f"Removed oldest line to stay under {MAX_LINES}.")


if __name__ == "__main__":
    main()
