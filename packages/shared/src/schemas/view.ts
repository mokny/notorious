import { z } from "zod";
import { VIEW_TYPES, FILTER_OPERATORS } from "../constants/viewTypes.js";

const viewFilterSchema = z.object({
  propertyId: z.string(),
  operator: z.enum(FILTER_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
});

const viewSortSchema = z.object({
  propertyId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

const viewConfigSchema = z.object({
  filters: z.array(viewFilterSchema).default([]),
  sorts: z.array(viewSortSchema).default([]),
  groupByPropertyId: z.string().nullable().optional(),
  pivotPropertyId: z.string().nullable().optional(),
  visiblePropertyIds: z.array(z.string()).default([]),
});

export const createViewSchema = z.object({
  objectTypeId: z.string().nullable().default(null),
  name: z.string().min(1).max(120),
  type: z.enum(VIEW_TYPES),
  config: viewConfigSchema.default({
    filters: [],
    sorts: [],
    visiblePropertyIds: [],
  }),
});
export type CreateViewInput = z.infer<typeof createViewSchema>;

export const updateViewSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: viewConfigSchema.optional(),
});
export type UpdateViewInput = z.infer<typeof updateViewSchema>;
