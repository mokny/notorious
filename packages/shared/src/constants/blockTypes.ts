/** All supported block types in the block editor. */
export const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "quote",
  "callout",
  "checklist",
  "table",
  "code",
  "image",
  "video",
  "embed",
  "pdf",
  "audio",
  "file",
  "math",
  "mermaid",
  "toggle",
  "secret",
  "divider",
  "columns",
  "database_view",
  "sub_object",
  "bookmark",
  "whiteboard",
  "calendar",
  "voting",
  "ai",
  "maps",
  "rssFeed",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** Block types that render inline rich text (backed by the TipTap/ProseMirror document). */
export const RICH_TEXT_BLOCK_TYPES: readonly BlockType[] = [
  "paragraph",
  "heading",
  "quote",
  "callout",
  "checklist",
  "toggle",
];

/** Block types that cannot contain child blocks. */
export const LEAF_BLOCK_TYPES: readonly BlockType[] = [
  "secret",
  "image",
  "video",
  "embed",
  "pdf",
  "audio",
  "file",
  "math",
  "mermaid",
  "divider",
  "database_view",
  "sub_object",
  "bookmark",
  "whiteboard",
  "calendar",
  "voting",
  "ai",
  "maps",
  "rssFeed",
];
