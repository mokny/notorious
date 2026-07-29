# Roadmap

This first pass is a **complete, working foundation** - every feature listed below as "in scope" is
fully implemented end to end (not a stub, not a placeholder). The items below that are explicitly
**out of scope** were agreed on up front because the full original feature list (plugin SDK, every
block/property/view variant, verified 100k+ object performance, native mobile push) is realistically
several weeks of additional work, and a solid, coherent base was prioritized over a thin layer across
everything at once.

## Explicitly out of scope for this pass

- **Plugin SDK.** The block-type registry (`BlockRenderer`), view-type registry (`ViewRenderer`) and
  property-type registry (`PropertyField`) are already internal dispatch tables - the natural
  extension points for a future plugin system - but there is no external plugin loading, sandboxing,
  or manifest format yet.
- **Full formula language.** `modules/schema/formula.ts` is a small, safe arithmetic expression
  evaluator (numbers, `{property}` references, `+ - * /`, parentheses, `round/abs/min/max`) - not a
  general scripting language like Notion's formula editor.
- **Verified 100k+ object performance.** The design accounts for scale (indices on `workspace_id`,
  `TableView` uses `@tanstack/react-virtual` so only visible rows render, pagination via cursor), but
  `modules/objects/query.ts` currently resolves up to `MAX_SCAN` (5,000) candidate objects per query
  before applying filters/sorts in application code rather than pushing them down into SQL. That is
  correct at real-world workspace sizes but has not been load-tested against an actual 100k-row
  workspace. Pushing filters into SQL (indexed `object_values` lookups per filter) is the natural next
  step if that becomes a bottleneck.
- **Native mobile app.** Mobile is a responsive installable PWA with Web Push, not a Capacitor/React
  Native wrapper - per your explicit choice during planning.
- **True offline-first CRDT sync.** Realtime updates are server-authoritative broadcast over
  WebSocket (last-write-wins by `updated_at`), not a conflict-free merge across offline edits on
  multiple devices.
- **In-browser Office document preview.** PDFs, images, video and audio preview inline; `.docx`/`.xlsx`/
  `.pptx` attachments download rather than render in the browser.
- **Rich text inside table cells.** The Table block's cells are plain text, not full inline rich text.
- **Fully lossless Markdown round-trip for structural blocks.** Paragraph/Heading/Quote/Callout/
  Checklist/Table/Code/Math/Mermaid/Divider/Toggle export and re-import cleanly. Columns and embedded
  Database Views export as a best-effort placeholder comment, since a live, multi-column data view has
  no faithful static Markdown representation.

## Natural next steps

1. Push view filters/sorts down into SQL for large workspaces.
2. A plugin manifest + sandboxed loader on top of the existing block/view/property registries.
3. Rich text inside table cells (swap the plain `<input>` cells for a nested `RichTextEditor`).
4. An activity feed UI reading from `activity_log` (the table already exists and is populated).
5. Comment threads on objects (not requested in the original spec, but a natural fit next to Backlinks).
