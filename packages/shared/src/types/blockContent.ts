import type { TableDoc } from "../utils/tableDoc.js";

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
