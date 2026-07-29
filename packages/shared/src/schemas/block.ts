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

export const importMarkdownSchema = z.object({
  objectId: z.string(),
  markdown: z.string().max(2_000_000),
});
export type ImportMarkdownInput = z.infer<typeof importMarkdownSchema>;
