# MCP server

Notorious exposes an [MCP](https://modelcontextprotocol.io) server at `POST /api/v1/mcp`, so any
MCP-capable AI client (Claude Desktop, Claude Code, ...) can create, search, read, update and
archive objects through natural-language prompts - the same tool set the in-app Agent Chat uses
(see below), just from outside the app.

## Authentication

There's no separate MCP-specific auth - it's the same personal API key mechanism every other API
request uses (see [API.md](API.md)). Generate one in **Settings -> API keys**, then send it as a
bearer token:

```
Authorization: Bearer ntr_<your key>
```

The server acts as whichever user the key belongs to, subject to that user's normal workspace
roles - an agent can't do anything the key's owner couldn't do themselves through the UI.

## Connecting a client

**Claude Code** (`claude mcp add`):

```bash
claude mcp add --transport http notorious http://your-server:4000/api/v1/mcp \
  --header "Authorization: Bearer ntr_<your key>"
```

**Claude Desktop** (`claude_desktop_config.json`), or any other client that supports a
Streamable HTTP MCP server with custom headers:

```json
{
  "mcpServers": {
    "notorious": {
      "url": "http://your-server:4000/api/v1/mcp",
      "headers": { "Authorization": "Bearer ntr_<your key>" }
    }
  }
}
```

The server is stateless (no session persisted between requests) - every call is independently
authenticated and authorized, so there's nothing to reconnect or expire beyond the API key itself.

## Available tools

| Tool | What it does |
| --- | --- |
| `list_workspaces` | List the workspaces the key's owner belongs to, with their ids - call this first if the workspace isn't already known |
| `list_object_types` | List a workspace's object types (Task, Note, ...), with the id needed to create one |
| `search_objects` | Free-text search within a workspace, optionally filtered to one object type |
| `get_object` | Full details of one object, including its property values |
| `create_object` | Create a new object of a given type, with a title and property values |
| `update_object` | Update an existing object's title and/or property values |
| `archive_object` | Archive an object (soft delete) |
| `add_paragraph_block` | Append a paragraph of text to an object |
| `add_checklist_block` | Append a checklist to an object |

This is the exact list defined in `packages/server/src/modules/ai/tools.ts` - both the MCP server
and the in-app Agent Chat register tools from that one file, so the two surfaces can never drift
apart.

## In-app alternative: Agent Chat

If you'd rather not run a separate MCP client, configure your own AI provider's API key in
**Settings -> AI** (OpenAI, Anthropic, or any OpenAI-compatible server, e.g. a local Ollama
instance) and use the **Agent Chat** page that appears in the sidebar once configured. It's the
same tool set, driven by a plain chat instead of an external client.
