# API examples

Small, self-contained scripts demonstrating the Notorious REST API in Python and PHP. Each script
is a single file with no dependencies beyond the language's standard library (Python's
`urllib.request`, PHP's `curl` extension) - copy one out and run it as-is.

See [`docs/API.md`](../docs/API.md) for the full API reference.

## Setup

1. **Get an API key**: in the web UI, go to Settings -> API keys -> Create key. Copy the token
   (shown once, prefixed `ntr_`).
2. **Find your workspace id**: open a workspace in the web UI, the id is in the URL
   (`/w/<workspaceId>/...`).
3. **Find an object id** (for scripts that need one): open any object, the id is in its URL.
4. Open the script you want to run and fill in the `API_TOKEN`, `WORKSPACE_ID`/`OBJECT_ID`
   constants near the top.
5. Requirements: Python 3.10+ (no extra packages), or PHP 8+ with the `curl` extension enabled
   (enabled by default in most installs).

## Scripts

| Script | What it shows |
| --- | --- |
| `auth_example.{py,php}` | Sending the `Authorization: Bearer` header, verifying a token works. |
| `create_object_example.{py,php}` | Looking up an object type id, then creating an object. |
| `list_blocks_example.{py,php}` | Reading an object and its content blocks. |
| `search_example.{py,php}` | Full-text/fuzzy search across a workspace. |
| `log_rotate.{py,php}` | Appending a block as a new "log line", removing the oldest one once the object holds more than `MAX_LINES` blocks. |
| `add_checklist_item.{py,php}` | Appending an item to an existing checklist block via `PATCH /api/v1/blocks/:id`. |

Run, e.g.:

```bash
python python/log_rotate.py "backup finished"
php php/log_rotate.php "backup finished"
```
