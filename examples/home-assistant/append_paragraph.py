#!/usr/bin/env python3
"""
Notorious API - Append a paragraph from Home Assistant (Python stdlib only).

Alternative to the native rest_command in configuration.yaml, for cases where
plain Jinja templating in HA isn't enough (e.g. you want to look up the block
list first, or share logic with a non-HA script). Intended to be called via
Home Assistant's `shell_command` integration - see the bottom of this file.

Usage:
    python append_paragraph.py "Front Door geöffnet um 14:32"
"""

import json
import sys
import urllib.error
import urllib.request

API_URL = "http://localhost:4000"
API_TOKEN = "ntr_your_api_token_here"
OBJECT_ID = "your-object-id"


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: python {sys.argv[0]} <paragraph text>")
    text = sys.argv[1]

    request = urllib.request.Request(
        f"{API_URL}/api/v1/blocks",
        data=json.dumps(
            {"objectId": OBJECT_ID, "type": "paragraph", "content": {"markdown": text}}
        ).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = json.loads(error.read())
        raise SystemExit(f"Request failed ({error.code}): {body.get('message')}")

    print(f"Appended: {text}")


if __name__ == "__main__":
    main()


# Home Assistant setup (configuration.yaml):
#
# shell_command:
#   notorious_add_paragraph: >-
#     python3 /config/scripts/append_paragraph.py "{{ text }}"
#
# automation:
#   - alias: "Log door sensor to Notorious (shell_command)"
#     trigger:
#       - platform: state
#         entity_id: binary_sensor.front_door
#     action:
#       - service: shell_command.notorious_add_paragraph
#         data:
#           text: >-
#             {{ trigger.to_state.name }}
#             {{ 'geöffnet' if trigger.to_state.state == 'on' else 'geschlossen' }}
#             um {{ now().strftime('%H:%M') }}
#
# Copy this file to Home Assistant's /config/scripts/ directory first, and fill
# in API_TOKEN/OBJECT_ID above. shell_command does not expand ~ or run through a
# shell with your normal PATH, so use the full path to both the interpreter and
# the script.
