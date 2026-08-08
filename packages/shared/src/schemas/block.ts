import { z } from "zod";
import { BLOCK_TYPES } from "../constants/blockTypes.js";
import { slugSchema } from "./slug.js";

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
  slug: slugSchema.optional(),
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

/**
 * Starting/stopping a whiteboard presentation is deliberately exempt from
 * the object-lock, but only for the workspace owner (see
 * workspaces/access.ts's `allowWhenLocked` and blocks/routes.ts) - the owner
 * needs to be able to reach this toggle even on a locked board. Its own
 * narrow endpoint, like `toggleChecklistItemSchema`, so that exemption can
 * never accidentally cover any other kind of edit to the block.
 */
export const toggleWhiteboardPresentingSchema = z.object({
  presenting: z.boolean(),
});
export type ToggleWhiteboardPresentingInput = z.infer<typeof toggleWhiteboardPresentingSchema>;

/**
 * Casting/changing/retracting a vote on a voting-block item is deliberately
 * exempt from the object-lock, and open to any viewer (including anonymous
 * share-link visitors) - see workspaces/access.ts's `allowWhenLocked` and
 * blocks/routes.ts. `voterKey` is required for anonymous requests (the
 * client's persisted visitor id, see web's lib/visitorIdentity.ts) since
 * there's no server-side identity for them otherwise; ignored for logged-in
 * requests, which use `request.user.id` instead. `value: null` retracts an
 * existing vote.
 */
export const castVoteSchema = z.object({
  itemId: z.string(),
  value: z.enum(["up", "down"]).nullable(),
  voterKey: z.string().optional(),
});
export type CastVoteInput = z.infer<typeof castVoteSchema>;

/**
 * Owner-only settings on a voting block (allowing multiple simultaneous
 * votes per voter, and an optional voting deadline) - its own narrow,
 * lock-exempt endpoint like `toggleWhiteboardPresentingSchema`, kept
 * separate from the generic `updateBlockSchema` so item edits (editor-role,
 * blocked when locked) and settings edits (owner-role, lock-exempt) can
 * enforce different access rules.
 */
export const updateVotingSettingsSchema = z.object({
  allowMultipleVotes: z.boolean(),
  votingEndsAt: z.string().nullable(),
});
export type UpdateVotingSettingsInput = z.infer<typeof updateVotingSettingsSchema>;

/**
 * Sends a prompt to the AI block's own generation endpoint (see
 * blocks/routes.ts's `/ai-generate`) - deliberately its own narrow endpoint
 * rather than going through `updateBlockSchema`, since it also has to run
 * the actual AI call server-side and needs the acting user's AI config, not
 * just persist a content payload.
 */
export const generateAiBlockSchema = z.object({
  prompt: z.string().min(1).max(20_000),
});
export type GenerateAiBlockInput = z.infer<typeof generateAiBlockSchema>;

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
