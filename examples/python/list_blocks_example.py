#!/usr/bin/env python3
"""
Notorious API - List an object's blocks example (Python stdlib only).

Fetches an object and its content blocks, and prints a readable outline.
Blocks come back in one flat, position-ordered array (no pagination).
"""

import json
import urllib.error
import urllib.request

API_URL = "http://localhost:4000"
API_TOKEN = "ntr_your_api_token_here"
OBJECT_ID = "your-object-id"


def request_json(path: str):
    request = urllib.request.Request(
        f"{API_URL}{path}",
        headers={"Authorization": f"Bearer {API_TOKEN}"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = json.loads(error.read())
        raise SystemExit(f"Request failed ({error.code}): {body.get('message')}")


def main() -> None:
    obj = request_json(f"/api/v1/objects/{OBJECT_ID}")
    blocks = request_json(f"/api/v1/objects/{OBJECT_ID}/blocks")

    print(f"{obj['title']}  ({len(blocks)} block(s))\n")
    for block in blocks:
        text = block["content"].get("markdown", json.dumps(block["content"]))
        print(f"[{block['type']}] {text}")


if __name__ == "__main__":
    main()
