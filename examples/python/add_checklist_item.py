#!/usr/bin/env python3
"""
Notorious API - Add a checklist item example (Python stdlib only).

A checklist is a single block whose content holds ALL of its items
(`{"items": [{"id", "markdown", "checked"}, ...]}`) - items are not
separate blocks. PATCH /api/v1/blocks/:id shallow-merges the given
`content` into the existing one, so appending an item means sending the
full items array back with the new one added.

Usage:
    python add_checklist_item.py "Buy milk"
"""

import json
import sys
import urllib.error
import urllib.request
import uuid

API_URL = "http://localhost:4000"
API_TOKEN = "ntr_your_api_token_here"
OBJECT_ID = "your-object-id"
CHECKLIST_BLOCK_ID = "your-checklist-block-id"


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
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        body_text = json.loads(error.read())
        raise SystemExit(f"Request failed ({error.code}): {body_text.get('message')}")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: python {sys.argv[0]} <item text>")
    item_text = sys.argv[1]

    blocks = request_json("GET", f"/api/v1/objects/{OBJECT_ID}/blocks")
    checklist = next((b for b in blocks if b["id"] == CHECKLIST_BLOCK_ID), None)
    if checklist is None or checklist["type"] != "checklist":
        raise SystemExit("CHECKLIST_BLOCK_ID does not point to a checklist block in OBJECT_ID.")

    new_item = {"id": str(uuid.uuid4()), "markdown": item_text, "checked": False}
    items = checklist["content"].get("items", []) + [new_item]

    request_json(
        "PATCH",
        f"/api/v1/blocks/{CHECKLIST_BLOCK_ID}",
        {"content": {"items": items}},
    )
    print(f"Added item: {item_text}")


if __name__ == "__main__":
    main()
