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

export const updateObjectSchema = z.object({
  title: z.string().max(2000).optional(),
  // Long enough for an uploaded icon's file URL (e.g. "/api/v1/files/<uuid>"),
  // not just a short emoji or Lucide icon-name slug.
  icon: z.string().max(500).nullable().optional(),
  cover: z.string().max(2000).nullable().optional(),
  values: z.record(z.string(), propertyValueSchema).optional(),
});
export type UpdateObjectInput = z.infer<typeof updateObjectSchema>;

export const setObjectLockedSchema = z.object({
  locked: z.boolean(),
});
export type SetObjectLockedInput = z.infer<typeof setObjectLockedSchema>;

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
