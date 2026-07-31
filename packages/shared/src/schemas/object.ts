import { z } from "zod";

const propertyValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const createObjectSchema = z.object({
  objectTypeId: z.string(),
  title: z.string().max(2000).default("Untitled"),
  // Long enough for an uploaded icon's file URL (e.g. "/api/v1/files/<uuid>"),
  // not just a short emoji or Lucide icon-name slug.
  icon: z.string().max(500).nullable().optional(),
  cover: z.string().max(2000).nullable().optional(),
  values: z.record(z.string(), propertyValueSchema).default({}),
});
export type CreateObjectInput = z.infer<typeof createObjectSchema>;

/** Mirrors the `CoverTextStyle` type in types/entities.ts - kept as a separate hand-written zod schema rather than derived from it, matching this file's existing `propertyValueSchema`/`PropertyValue` split. */
export const coverTextStyleSchema = z.object({
  color: z.string().max(30),
  opacity: z.number().min(0).max(1),
  shadow: z.boolean(),
  backgroundEnabled: z.boolean(),
  backgroundColor: z.string().max(30),
  backgroundOpacity: z.number().min(0).max(1),
  fontFamily: z.enum(["default", "serif", "sans-serif", "monospace", "cursive"]),
  bold: z.boolean(),
  italic: z.boolean(),
  uppercase: z.boolean(),
});

export const updateObjectSchema = z.object({
  title: z.string().max(2000).optional(),
  // Long enough for an uploaded icon's file URL (e.g. "/api/v1/files/<uuid>"),
  // not just a short emoji or Lucide icon-name slug.
  icon: z.string().max(500).nullable().optional(),
  cover: z.string().max(2000).nullable().optional(),
  coverTextStyle: coverTextStyleSchema.nullable().optional(),
  values: z.record(z.string(), propertyValueSchema).optional(),
});
export type UpdateObjectInput = z.infer<typeof updateObjectSchema>;

export const setObjectLockedSchema = z.object({
  locked: z.boolean(),
});
export type SetObjectLockedInput = z.infer<typeof setObjectLockedSchema>;

/**
 * Deliberately its own endpoint/schema, not folded into `updateObjectSchema` -
 * script mutations go through a stricter "real workspace member only" auth
 * check (see workspaces/access.ts's `requireRealMemberAccess`) that plain
 * title/property edits via the generic PATCH must NOT be subject to (share-
 * link editors still need to edit those). Splitting the endpoint is what
 * makes that distinction enforceable.
 */
export const updateObjectScriptSchema = z.object({
  scriptSource: z.string().max(20_000).nullable(),
});
export type UpdateObjectScriptInput = z.infer<typeof updateObjectScriptSchema>;

export const setScriptEnabledSchema = z.object({
  enabled: z.boolean(),
});
export type SetScriptEnabledInput = z.infer<typeof setScriptEnabledSchema>;

export const scriptRunResultSchema = z.object({
  ranAt: z.string(),
  success: z.boolean(),
  triggerType: z.enum(["manual", "automation"]),
  durationMs: z.number(),
  log: z.string(),
  error: z.string().nullable(),
});
export type ScriptRunResult = z.infer<typeof scriptRunResultSchema>;

export const listObjectsQuerySchema = z.object({
  objectTypeId: z.string().optional(),
  archived: z.coerce.boolean().default(false),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListObjectsQuery = z.infer<typeof listObjectsQuerySchema>;

export const createRelationSchema = z.object({
  propertyId: z.string(),
  sourceObjectId: z.string(),
  targetObjectId: z.string(),
});
export type CreateRelationInput = z.infer<typeof createRelationSchema>;
