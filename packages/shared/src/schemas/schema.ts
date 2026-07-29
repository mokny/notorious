import { z } from "zod";
import { PROPERTY_TYPES } from "../constants/propertyTypes.js";

const propertyOptionSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(60),
  color: z.string().min(1).max(20),
});

/** Discriminated-by-caller config payload; validated more strictly server-side per `type`. */
const propertyConfigSchema = z.object({
  options: z.array(propertyOptionSchema).optional(),
  max: z.number().int().min(1).max(10).optional(),
  precision: z.number().int().min(0).max(10).optional(),
  targetObjectTypeId: z.string().nullable().optional(),
  twoWay: z.boolean().optional(),
  expression: z.string().max(2000).optional(),
  relationPropertyId: z.string().optional(),
  sourcePropertyId: z.string().optional(),
  function: z.enum(["count", "sum", "average", "min", "max", "earliest", "latest"]).optional(),
});

export const createObjectTypeSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase snake_case"),
  name: z.string().min(1).max(120),
  icon: z.string().min(1).max(16).default("file"),
});
export type CreateObjectTypeInput = z.infer<typeof createObjectTypeSchema>;

export const createPropertySchema = z.object({
  objectTypeId: z.string(),
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase snake_case"),
  name: z.string().min(1).max(120),
  type: z.enum(PROPERTY_TYPES),
  config: propertyConfigSchema.default({}),
  position: z.number().default(0),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: propertyConfigSchema.optional(),
  position: z.number().optional(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
