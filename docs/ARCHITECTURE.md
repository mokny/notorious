# Architecture

## Monorepo layout

```
packages/
  shared/   Types, Zod schemas and constants shared by server and web (single source of truth
            for object types, property types, block types, view types, API request/response shapes)
  server/   Fastify API + WebSocket server, SQLite via Drizzle ORM
  web/      React + Vite SPA, installable as a PWA on desktop and mobile
scripts/
  install.sh, update.sh   Server provisioning/update scripts, see docs/DEPLOYMENT.md
  bump-version.mjs        Patch-version bump run by the pre-commit hook, see README.md#versioning
```

`packages/shared` is built to plain JS + `.d.ts` files and consumed by both other packages via the
npm workspace symlink (`@notorious/shared`). Changing a shared type is therefore a single edit that
both the API and the UI are forced (by the type checker) to stay in sync with.

## Data model

Everything an object type + properties combo can describe, deliberately stays uniform:

- **`object_types`** - the built-in types (Note, Project, Task, Person, Book, Meeting, Company,
  File, Database, Collection) are seeded per-workspace when a workspace is created (see
  `modules/schema/systemTypes.ts`), and users can add their own on top. Seeding per-workspace (rather
  than sharing one global row) means one workspace's custom properties on "Task" never leak into
  another workspace's Task objects.
- **`properties`** - one row per field on an object type. All 20 property kinds (Text, Number,
  Boolean, Date, DateTime, URL, Email, Phone, Tag, MultiTag, Status, Select, MultiSelect, Rating,
  File, Image, Checkbox, Relation, Formula, Rollup) share this table; the type-specific config
  (select options, formula expression, rollup source, ...) lives in a JSON `config` column.
- **`objects`** - one row per object (a Task, a Note, ...). Everything type-agnostic (title, icon,
  cover, timestamps) lives here.
- **`object_values`** - EAV table: `(object_id, property_id) -> JSON value`, used for every stored
  property type. Relation-type properties are **not** stored here - see below.
- **`relations`** - `(property_id, source_object_id, target_object_id)`. Every link between two
  objects, in both directions, lives here; backlinks are just this table queried by `target_object_id`.
- **`blocks`** - the block-editor content tree for a single object. Each block has a `parent_block_id`
  (for Toggle/Columns nesting) and a fractional-index `position` string (via the `fractional-indexing`
  package), so reordering a block only ever rewrites that one row - never its siblings.
- **`views`** - a saved Table/Board/Timeline/Gallery/Calendar/List configuration (filters, sorts,
  which property drives Board columns or the Calendar/Timeline date axis). All six view types query
  the exact same object data through `modules/objects/query.ts`.

Formula and Rollup properties are **computed on read**, never stored: see
`modules/objects/valueResolver.ts` and `modules/schema/formula.ts` (a small hand-rolled expression
parser - deliberately not `eval()`/`Function()`, since formula expressions are workspace-user input).

## Realtime sync

The server keeps an in-memory map of `workspaceId -> connected WebSocket clients`
(`modules/realtime/hub.ts`). Every mutation that changes an object, block, relation or membership
calls `recordAndBroadcast()`, which writes an audit-log row (`activity_log`, also what a future
activity feed would read from) and pushes a small `{ entity, action, entityId, ... }` event to every
client currently viewing that workspace. The frontend's `useRealtime` hook turns that into a React
Query cache invalidation, so the next render just refetches the affected object/view.

This is **server-authoritative, last-write-wins** (by `updated_at`), not a CRDT. Two people editing
the same block's text at the same moment will not merge character-by-character - the second save
wins. Real offline-first conflict-free sync is out of scope for this pass; see
[ROADMAP.md](ROADMAP.md).

## Search

`objects_fts` is a SQLite FTS5 virtual table (`title`, `body`, trigram tokenizer) kept in sync
manually by `modules/search/indexer.ts` whenever an object's title or blocks change (blocks are
flattened to plain text for the `body` column). Fuzzy search is a second pass:
`modules/search/fuzzy.ts` scores every candidate title (and its individual words, so a typo in one
word of a long title still matches) with Levenshtein distance, used as a fallback when the FTS query
returns fewer results than requested.

## Block editor

Rich-text block types (Paragraph, Heading, Quote, Callout, Checklist items, Toggle summary) each get
their own small TipTap/ProseMirror instance configured to hold exactly one paragraph of inline
content (bold/italic/code/link) - `Enter` always means "create a new block", never "new line in this
block". The `tiptap-markdown` extension serializes that inline content directly to a Markdown string,
which is exactly what gets stored in `blocks.content.markdown` - so Markdown export/import
(`modules/blocks/markdown.ts`, using `unified`/`remark`) is close to a direct passthrough instead of a
lossy conversion from a proprietary rich-text format.

Kanban and "Database" blocks are not a separate block type: they are a `database_view` block that
embeds a saved `View` (see `components/editor/blocks/DatabaseViewBlock.tsx`), the same "linked
database" concept Notion uses - reusing the Views infrastructure instead of building a second,
parallel data-grid implementation.

## Roles and permissions

Workspace membership roles (`viewer < commenter < editor < owner`) are enforced server-side on every
route via `modules/workspaces/access.ts#requireWorkspaceRole`, never trusted from the client. Sharing
a workspace with an email that doesn't have an account yet stores a pending `workspace_invites` row,
redeemed automatically the moment that person registers (`modules/auth/service.ts#redeemPendingInvites`).

## Authentication

Two independent ways to resolve `request.user`, checked in `plugins/session.ts`'s `onRequest` hook:
an `Authorization: Bearer <token>` header (personal API keys, `modules/apiKeys/`), or the
`notorious_sid` session cookie. API keys are stored as a SHA-256 hash (`modules/apiKeys/service.ts`) -
fast on purpose, since the token itself is a random 256-bit value and gains nothing from a slow,
adaptive hash the way a low-entropy user password does. A key authenticates as its owning user with
no separate scoping: it is subject to exactly the same `requireWorkspaceRole` checks as that user's
browser session.
