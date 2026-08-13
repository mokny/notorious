#!/usr/bin/env python3
"""
Notorious API - Full-text/fuzzy search example (Python stdlib only).

Usage:
    python search_example.py "search text"
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

API_URL = "http://localhost:4000"
API_TOKEN = "ntr_your_api_token_here"
WORKSPACE_ID = "your-workspace-id"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: python {sys.argv[0]} <search text>")
    query = sys.argv[1]

    params = urllib.parse.urlencode({"q": query})
    request = urllib.request.Request(
        f"{API_URL}/api/v1/workspaces/{WORKSPACE_ID}/search?{params}",
        headers={"Authorization": f"Bearer {API_TOKEN}"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            results = json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = json.loads(error.read())
        raise SystemExit(f"Request failed ({error.code}): {body.get('message')}")

    print(f"{len(results)} result(s) for '{query}':")
    for obj in results:
        print(f"  - {obj['title']}  (id: {obj['id']})")


if __name__ == "__main__":
    main()
