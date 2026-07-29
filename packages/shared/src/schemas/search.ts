import { z } from "zod";
import { FILTER_OPERATORS } from "../constants/viewTypes.js";

export const searchQuerySchema = z.object({
  q: z.string().max(500).default(""),
  objectTypeId: z.string().optional(),
  tagPropertyId: z.string().optional(),
  tagValue: z.string().optional(),
  relatedToObjectId: z.string().optional(),
  fuzzy: z.coerce.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const createSavedSearchSchema = z.object({
  name: z.string().min(1).max(120),
  query: z.string().max(500),
  filters: z
    .array(
      z.object({
        propertyId: z.string(),
        operator: z.enum(FILTER_OPERATORS),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
      }),
    )
    .default([]),
});
export type CreateSavedSearchInput = z.infer<typeof createSavedSearchSchema>;
