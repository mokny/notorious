import type { TableDoc } from "../utils/tableDoc.js";
import type { ViewFilter, ViewSort } from "../constants/viewTypes.js";

/**
 * Per-block-type content payloads stored in `blocks.content` (as JSON) and
 * consumed directly by the block editor UI. Rich text fields are stored as
 * inline Markdown strings, produced by the `tiptap-markdown` serializer in
 * the web editor - this is what makes Markdown import/export close to a
 * direct passthrough instead of a lossy re-derivation from a proprietary
 * rich-text format.
 */
export interface ParagraphContent {
  markdown: string;
}
export interface HeadingContent {
  markdown: string;
  level: 1 | 2 | 3;
}
export interface QuoteContent {
  markdown: string;
}
export interface CalloutContent {
  markdown: string;
  icon: string;
}
export interface ChecklistItem {
  /**
   * Optional only for backward compatibility with checklists saved before
   * drag-reordering was added - `ChecklistBlock.tsx` backfills a real one
   * for any item that's missing it, the moment it loads. New items always
   * get one at creation. Needed as a stable drag identity: the array index
   * a `useSortable` hook would otherwise use changes on every reorder,
   * which is exactly the one thing that must *not* change mid-drag.
   */
  id?: string;
  markdown: string;
  checked: boolean;
}
export interface ChecklistContent {
  items: ChecklistItem[];
  /** When true, checking an item off moves it to the bottom of the list after a short delay instead of leaving it in place - see ChecklistBlock.tsx's CHECKED_MOVE_DELAY_MS. Default false. */
  sortCheckedToBottom?: boolean;
}
/**
 * Unlike other rich-text block content, a table's content is a TipTap/
 * ProseMirror JSON document (see utils/tableDoc.ts) rather than a Markdown
 * string - cell background color, alignment, and merged cells (colspan/
 * rowspan) have no Markdown representation. Tables saved before this shape
 * (`{ columns: string[], rows: string[][] }`) are migrated by
 * `scripts/migrateTableBlocks.ts`.
 */
export interface TableContent {
  doc: TableDoc;
}
export interface CodeContent {
  code: string;
  language: string;
}
export interface ImageContent {
  url: string;
  caption?: string;
  fileId?: string;
}
export interface VideoContent {
  url: string;
  caption?: string;
  fileId?: string;
}
export interface EmbedContent {
  url: string;
}
export interface MathContent {
  latex: string;
}
export interface MermaidContent {
  code: string;
}
export type DividerContent = Record<string, never>;
export interface ColumnsContent {
  columnCount: number;
}
export interface DatabaseViewContent {
  viewId: string;
}
export interface ToggleContent {
  summaryMarkdown: string;
}
/** Embeds a link to another object inline in the document, expandable to that object's own sub-objects (recursively). `objectId` is null until a target has been picked. */
export interface SubObjectContent {
  objectId: string | null;
  /**
   * Set only when this block was created by picking one of the per-object-type
   * entries in the add-block/slash menu (see SlashCommand.ts) rather than the
   * plain "Existing Object" entry - tells SubObjectBlock.tsx to immediately
   * create a new object of this type and link it, instead of showing the
   * search/create picker. Ignored once `objectId` is set.
   */
  pendingObjectTypeId?: string;
  /**
   * "link" (the default, when unset) shows just a title/icon card, expandable
   * to the target's own sub-objects. "embed" additionally renders the
   * target's actual block content inline, read-only (see SubObjectBlock.tsx)
   * - toggled from a control on the block itself, changeable at any time.
   */
  displayMode?: "link" | "embed";
}
/** A bookmarked URL rendered as a card. `url` is empty until one has been entered; `title`/`description`/`icon` are auto-filled (title, and `icon` from the page's favicon) but freely editable afterwards, not re-fetched from the page once set. */
export interface BookmarkContent {
  url: string;
  title?: string;
  description?: string;
  icon?: string | null;
}
/**
 * A drawing/sketching canvas (shapes, text, freehand, arrows - see
 * WhiteboardBlock.tsx, backed by Excalidraw) - either embedded as a block in
 * any object, or the sole content of a dedicated Whiteboard object (one gets
 * created automatically when a Whiteboard object is created, see
 * modules/objects/service.ts). `sceneJson` is Excalidraw's own `.excalidraw`
 * file-format JSON (from its `serializeAsJSON` helper) kept as an opaque
 * string - only the whiteboard block itself, never the server, needs to
 * interpret it.
 */
export interface WhiteboardContent {
  sceneJson?: string;
  /** Presentation mode - while true, only the workspace owner can draw/edit; everyone else gets a live, view-only canvas (still pans/zooms, still sees updates in real time). Toggled by WhiteboardBlock.tsx, persisted like any other content field so it's in sync for every viewer. */
  presenting?: boolean;
}

/** One votable option in a Voting block's list - see `VotingContent`. */
export interface VotingItem {
  id: string;
  title: string;
  description?: string;
}
/**
 * A Reddit-style votable list (see VotingBlock.tsx): each `VotingItem` gets
 * its own upvote/downvote arrows and net-score/ratio display. Aggregated
 * scores and the caller's own vote are NOT part of this content - they're
 * computed server-side from the `vote_records` table (see modules/blocks/
 * service.ts) and attached to the block response instead, since they depend
 * on who's asking and change independently of the item list itself.
 */
export interface VotingContent {
  items: VotingItem[];
  /** Default true - lets a voter vote on more than one item in the same block. When false, voting on a different item moves the voter's single vote instead of adding one. */
  allowMultipleVotes?: boolean;
  /** ISO timestamp after which voting closes (arrows disable, results stay visible) - undefined/null means no deadline (the default). */
  votingEndsAt?: string | null;
}

/** One item's live vote counts plus (if the caller is identifiable) their own vote - see `GET /api/v1/blocks/:id/votes` and modules/blocks/service.ts's `getVoteSummary`. */
export interface VoteSummary {
  up: number;
  down: number;
  myVote: "up" | "down" | null;
}

/** One object type plotted on a calendar block - which property supplies its date (a "date"/"datetime"/"daterange" property on that type), plus a View-style filter/sort scoped to just this type. */
export interface CalendarBlockObjectTypeConfig {
  objectTypeId: string;
  datePropertyId: string;
  filters: ViewFilter[];
  sorts: ViewSort[];
}
/**
 * A calendar over one or more object types (each configured independently -
 * see `CalendarBlockObjectTypeConfig`), rendered as Year/Month/Week/Day/Agenda
 * (see CalendarBlock.tsx). Deliberately its own content shape rather than
 * wrapping a saved `View` (unlike DatabaseViewContent) - a calendar combines
 * several object types with a per-type date property, which the single-type
 * `View`/`ViewConfig` model doesn't represent.
 */
export interface CalendarBlockContent {
  objectTypeConfigs: CalendarBlockObjectTypeConfig[];
  /** Last-viewed granularity - purely a per-block UX convenience (reopens where you left off), not collaborative state. */
  granularity?: "year" | "month" | "week" | "day" | "agenda";
}

/**
 * Picks a sensible block type/content for a file, based on its MIME type -
 * shared between the web drop handler (BlockEditor.tsx) and the server's
 * share-target commit flow (modules/shareTarget/service.ts), which both need
 * the exact same mapping but only one of them has a DOM `File` object to
 * work with, hence the plain-value signature instead of `(file: File, ...)`.
 */
export function blockContentForFile(
  mimeType: string,
  filename: string,
  url: string,
  fileId: string,
): { type: "image" | "video" | "embed" | "paragraph"; content: Record<string, unknown> } {
  if (mimeType.startsWith("image/")) return { type: "image", content: { url, caption: filename, fileId } };
  if (mimeType.startsWith("video/")) return { type: "video", content: { url, caption: filename, fileId } };
  if (mimeType.startsWith("audio/") || mimeType === "application/pdf") return { type: "embed", content: { url } };
  return { type: "paragraph", content: { markdown: `[${filename}](${url})` } };
}
