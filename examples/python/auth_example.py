#!/usr/bin/env python3
"""
Notorious API - Authentication example (Python stdlib only).

Sends a Bearer-token request to a protected endpoint to verify that an
API key works, and prints the workspaces the key's owner can see.

Get an API key: web UI -> Settings -> API keys -> Create key.
"""

import json
import urllib.error
import urllib.request

API_URL = "http://localhost:4000"
API_TOKEN = "ntr_your_api_token_here"


def main() -> None:
    request = urllib.request.Request(
        f"{API_URL}/api/v1/workspaces",
        headers={"Authorization": f"Bearer {API_TOKEN}"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            workspaces = json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = json.loads(error.read())
        print(f"Authentication failed ({error.code}): {body.get('message')}")
        return

    print(f"Token is valid. Access to {len(workspaces)} workspace(s):")
    for workspace in workspaces:
        print(f"  - {workspace['name']}  (id: {workspace['id']})")


if __name__ == "__main__":
    main()
