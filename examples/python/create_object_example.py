#!/usr/bin/env python3
"""
Notorious API - Create an object example (Python stdlib only).

Creating an object requires the target object type's id (not a plain string
like "note" - every workspace has its own row per system type). This script
first looks up the "note" type in the workspace, then creates a new object
of that type.
"""

import json
import urllib.error
import urllib.request

API_URL = "http://localhost:4000"
API_TOKEN = "ntr_your_api_token_here"
WORKSPACE_ID = "your-workspace-id"


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
    object_types = request_json("GET", f"/api/v1/workspaces/{WORKSPACE_ID}/object-types")
    note_type = next((t for t in object_types if t["key"] == "note"), None)
    if note_type is None:
        raise SystemExit("No 'note' object type found in this workspace.")

    created = request_json(
        "POST",
        f"/api/v1/workspaces/{WORKSPACE_ID}/objects",
        {"objectTypeId": note_type["id"], "title": "Created via the API"},
    )

    print(f"Created object '{created['title']}' (id: {created['id']})")


if __name__ == "__main__":
    main()
