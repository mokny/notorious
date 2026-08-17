# Home Assistant example

Appends a paragraph block to a Notorious note whenever a Home Assistant automation
fires - e.g. logging every door/window sensor change to a running "Home Log" note.
Shows two ways to call the Notorious API from Home Assistant:

| File | Approach | When to use it |
| --- | --- | --- |
| `configuration.yaml` | Native `rest_command` + Jinja templating | Default choice - no extra files on the HA host, works on Home Assistant OS/Supervised/Container alike. |
| `append_paragraph.py` + `shell_command` | Python script called as a shell command | When the logic needs more than a Jinja template can express, or you want to share code with a standalone script (see `../python/`). Requires a HA install that allows running arbitrary scripts (Core/Container, not HA OS with `shell_command` sandboxed). |

## Setup

1. **Get an API key**: web UI -> Settings -> API keys -> Create key. Copy the token
   (shown once, prefixed `ntr_`).
2. **Find the target object id**: open the note in the web UI, the id is in the URL.
3. Pick one of the two approaches above and follow the setup comments at the top of
   that file.
4. Reload Home Assistant's YAML configuration (Developer Tools -> YAML, or restart).

Both examples target a *fixed* object id - point it at a note you use only for this
log, the same way `../python/log_rotate.py` does.
