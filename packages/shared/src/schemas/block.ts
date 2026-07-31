import { z } from "zod";
import { BLOCK_TYPES } from "../constants/blockTypes.js";

export const createBlockSchema = z.object({
  objectId: z.string(),
  parentBlockId: z.string().nullable().default(null),
  type: z.enum(BLOCK_TYPES),
  content: z.record(z.string(), z.unknown()).default({}),
  /** Fractional index string placing the block relative to its siblings. */
  afterBlockId: z.string().nullable().optional(),
});
export type CreateBlockInput = z.infer<typeof createBlockSchema>;

export const updateBlockSchema = z.object({
  content: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>;

export const moveBlockSchema = z.object({
  parentBlockId: z.string().nullable(),
  afterBlockId: z.string().nullable(),
});
export type MoveBlockInput = z.infer<typeof moveBlockSchema>;

/**
 * Checking an item off is deliberately exempt from the object-lock (see
 * workspaces/access.ts's `allowWhenLocked` and objects/routes.ts's lock
 * endpoint) - ticking a to-do isn't "editing" the object's content the same
 * way changing its text/structure is, so it goes through its own narrow
 * endpoint rather than the general `updateBlockSchema` one.
 */
export const toggleChecklistItemSchema = z.object({
  itemId: z.string(),
  checked: z.boolean(),
});
export type ToggleChecklistItemInput = z.infer<typeof toggleChecklistItemSchema>;

export const importMarkdownSchema = z.object({
  objectId: z.string(),
  markdown: z.string().max(2_000_000),
});
export type ImportMarkdownInput = z.infer<typeof importMarkdownSchema>;

/**
 * Re-inserts a block exactly as it was, id and position included - used by
 * the editor's undo/redo (see useEditorHistory.ts) to bring back a deleted
 * block, or to redo a create that was just undone. Unlike `createBlockSchema`
 * (which always generates a fresh id and computes a fresh position from
 * `afterBlockId`), undo/redo needs the block to reappear in the exact same
 * spot it was in - not "at the end" or "wherever its neighbors happen to be
 * now".
 */
export const restoreBlockSchema = z.object({
  objectId: z.string(),
  id: z.string(),
  parentBlockId: z.string().nullable(),
  type: z.enum(BLOCK_TYPES),
  content: z.record(z.string(), z.unknown()),
  position: z.string(),
});
export type RestoreBlockInput = z.infer<typeof restoreBlockSchema>;
