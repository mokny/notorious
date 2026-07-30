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
  markdown: string;
  checked: boolean;
}
export interface ChecklistContent {
  items: ChecklistItem[];
}
export interface TableContent {
  columns: string[];
  rows: string[][];
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
}
/** A bookmarked URL rendered as a card. `url` is empty until one has been entered; `title`/`description` are freely editable, not fetched from the page. */
export interface BookmarkContent {
  url: string;
  title?: string;
  description?: string;
}
