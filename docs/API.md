# API

Every action available in the web UI is available through the REST API. The full, always-up-to-date
reference is generated from the server's Zod schemas and served live at **`/api/docs`** (Swagger UI)
once the server is running - this file is a narrative overview, not a replacement for it.

## Authentication

Two ways to authenticate, checked in this order on every request:

**1. API key** (for scripts/other systems) - a personal key generated in **Settings -> API keys**
while logged into the web UI, sent as a bearer token:

```bash
curl -H "Authorization: Bearer ntr_<your key>" http://localhost:4000/api/v1/workspaces
```

Keys act as the user who created them, subject to the exact same workspace-role checks as that user's
browser session - there is no separate scoping/permission model to configure. Only the SHA-256 hash of
the key is stored server-side; the plaintext is shown once, at creation time
(`POST /api/v1/api-keys`), and never again.

| Endpoint | Notes |
| --- | --- |
| `GET/POST /api/v1/api-keys` | List your keys (name, prefix, timestamps - never the key itself), or create one: `{ name }` |
| `DELETE /api/v1/api-keys/:id` | Revoke a key immediately |

**2. Session cookie** (what the browser uses) - not JWT: `POST /api/v1/auth/login` sets an `httpOnly`
cookie (`notorious_sid`) tied to a server-side session row, so a session can be revoked (logout, or
manually deleting the row) instead of just expiring.

```bash
# Log in and keep the session cookie for subsequent requests
curl -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'

curl -b cookies.txt http://localhost:4000/api/v1/workspaces
```

| Endpoint | Notes |
| --- | --- |
| `POST /api/v1/auth/register` | Creates a user + their first personal workspace; redeems any pending invites for that email. 403s unless self-registration is enabled instance-wide (`npm run enable-registration`, off by default) *or* the email has a pending workspace invite |
| `POST /api/v1/auth/login` | `{ email, password }` -> the `User`, or, if the account has 2FA enabled, `{ pending2fa: true }` plus a short-lived `notorious_pending_2fa` cookie (see below) instead of a real session |
| `POST /api/v1/auth/logout` | Clears the session cookie |
| `GET /api/v1/auth/me` | Current user, or 401 |
| `GET /api/v1/system/registration-status` | Unauthenticated - `{ enabled: boolean }`, so the login/register pages can show whether open sign-up is currently on |

### Two-factor authentication (TOTP)

Per-user, opt-in by default (see `npm run enable-2fa-requirement` in [DEPLOYMENT.md](DEPLOYMENT.md) to make
it mandatory instance-wide). Backed by any standard authenticator app (Google Authenticator, Authy,
1Password, ...) - the server never sees your codes, only verifies TOTP tokens against an encrypted-at-rest
secret.

| Endpoint | Notes |
| --- | --- |
| `POST /api/v1/auth/2fa/setup` | Requires a session. Generates a fresh secret, returns `{ secret, qrCodeDataUrl }` - `totpEnabled` stays `false` until confirmed |
| `POST /api/v1/auth/2fa/confirm` | `{ code }` (6 digits). Verifies the code, enables 2FA, and returns `{ backupCodes: string[] }` - **shown once, never again** |
| `POST /api/v1/auth/2fa/disable` | `{ currentPassword }`. Removes the secret and backup codes |
| `POST /api/v1/auth/2fa/verify` | No session required - reads the `notorious_pending_2fa` cookie set by `/auth/login`. `{ code }` *or* `{ backupCode }`, not both. On success, creates the real session and returns the `User`. Each backup code works once |
| `GET /api/v1/system/2fa-required` | Unauthenticated - `{ required: boolean }`, the instance-wide 2FA mandate |

## Workspaces & sharing

| Endpoint | Role required |
| --- | --- |
| `GET/POST /api/v1/workspaces` | member / any authenticated user |
| `GET/PATCH /api/v1/workspaces/:id` | viewer / editor |
| `GET/POST /api/v1/workspaces/:id/members` | viewer / owner (invite by email; adds immediately if that user already exists, otherwise stores a pending invite) |
| `PATCH/DELETE /api/v1/workspaces/:id/members/:userId` | owner |
| `GET/DELETE /api/v1/workspaces/:id/invites[/:inviteId]` | owner |

## Object types, properties, objects, relations

- `GET/POST /api/v1/workspaces/:workspaceId/object-types`, `DELETE .../object-types/:id`
- `GET /api/v1/object-types/:objectTypeId/properties`, `POST/PATCH/DELETE .../properties[/:id]`
- `GET/POST /api/v1/workspaces/:workspaceId/objects` - list supports `objectTypeId`, `archived`,
  `cursor`, `limit`
- `GET/PATCH/DELETE /api/v1/objects/:id`, plus `POST /api/v1/objects/:id/archive` and `/restore`
- `GET /api/v1/objects/:id/backlinks` - every object linking *to* this one, across all relation properties
- `POST /api/v1/objects/:id/complete-recurring` - marks a recurring task done and, if it has an
  active recurrence rule, creates the next occurrence with its deadline/reminder shifted forward
- `POST /api/v1/workspaces/:workspaceId/relations`, `DELETE .../relations/:id` or
  `DELETE .../relations/by-triple` (by `propertyId` + `sourceObjectId` + `targetObjectId` - what the
  UI uses, since it only ever has the two object ids on hand, not the relation row's own id)

## Blocks

- `GET /api/v1/objects/:objectId/blocks` - flat, position-ordered list; the client builds the tree
  client-side from `parentBlockId`
- `POST /api/v1/blocks` - `{ objectId, parentBlockId, type, content, afterBlockId }`
- `PATCH /api/v1/blocks/:id`, `POST /api/v1/blocks/:id/move`, `DELETE /api/v1/blocks/:id`
- `POST /api/v1/blocks/import-markdown` - `{ objectId, markdown }`, replaces the object's entire block tree
- `GET /api/v1/objects/:objectId/export-markdown` - downloads a `.md` file
- `GET /api/v1/objects/:objectId/blocks/rendered` - `{ rendered: { [blockId]: { [field]: string } } }`, the
  object's blocks with any `{{ }}`/`{% %}` template syntax (see [TEMPLATES.md](TEMPLATES.md)) evaluated -
  only fields that actually contained template syntax are included

## Views

- `GET/POST /api/v1/workspaces/:workspaceId/views?objectTypeId=...`
- `PATCH/DELETE /api/v1/views/:id`
- `GET /api/v1/views/:id/results?cursor=&limit=` - runs the view's filters/sorts against live object
  data; Table, Board, List, Gallery, Calendar and Timeline all call this same endpoint

## Search

- `GET /api/v1/workspaces/:workspaceId/search?q=&fuzzy=&objectTypeId=&tagPropertyId=&tagValue=&relatedToObjectId=`
- `GET/POST /api/v1/workspaces/:workspaceId/saved-searches`, `DELETE /api/v1/saved-searches/:id`

## Files

- `POST /api/v1/workspaces/:workspaceId/files` - multipart upload, optional `objectId`/`blockId` fields
- `GET /api/v1/files/:id` - streams the file (`inline` for images/video/audio/PDF, `attachment` otherwise)
- `GET /api/v1/objects/:objectId/files`, `DELETE /api/v1/files/:id`

## Backup

- `GET /api/v1/workspaces/:workspaceId/backup` (owner only) - downloads a ZIP of everything in that
  workspace (schema, objects, blocks, relations, views, files)
- `POST /api/v1/workspaces/import` - multipart ZIP upload, always creates a **new** workspace (never
  overwrites an existing one) owned by the uploading user

## Webhooks

Owner-only. `GET/POST /api/v1/workspaces/:workspaceId/webhooks`, `PATCH/DELETE .../:id`,
`POST .../:id/test`. Fires an HTTP POST for `object.created`/`updated`/`archived`/`restored`/
`deleted` (whichever events a given webhook subscribes to), signed with `X-Notorious-Signature:
sha256=<hex hmac>` over the raw JSON body using that webhook's own secret (returned once, at
creation). The payload includes the full current object (title, values, timestamps) plus its
object type, workspace and the actor who made the change - see `WebhookPayload` in
`@notorious/shared`.

## AI agent & MCP

- `GET/PATCH/DELETE /api/v1/ai/config` - the current user's own AI provider configuration
  (provider, model, API key). `GET` never returns the key itself, only whether one is set.
- `GET/POST/DELETE /api/v1/workspaces/:workspaceId/ai/chat` - the Agent Chat's message history for
  the current user in that workspace; `POST { message }` runs one turn of the tool-calling loop and
  returns the messages it appended.
- `POST /api/v1/mcp` - an MCP (Model Context Protocol) server exposing the same object-management
  tools to external AI clients (Claude Desktop, Claude Code, ...), authenticated with a personal API
  key like any other endpoint. See [MCP.md](MCP.md) for how to connect a client and the full tool list.

## Push notifications

- `GET /api/v1/push/vapid-public-key`
- `POST /api/v1/push/subscribe` - `{ endpoint, keys: { p256dh, auth } }` (a `PushSubscriptionJSON`)
- `POST /api/v1/push/unsubscribe` - `{ endpoint }`

## Realtime

`GET /ws?workspaceId=...` (WebSocket upgrade, same auth as above - browsers use the session cookie;
non-browser clients can send `Authorization: Bearer` during the handshake) - joins that workspace's
broadcast room. Messages are JSON `RealtimeEvent` objects: `{ workspaceId, entity, action, entityId,
objectId?, actorId, at }`.
