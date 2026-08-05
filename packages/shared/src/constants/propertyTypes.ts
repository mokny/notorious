/** All supported property ("field") types that can be attached to an object type. */
export const PROPERTY_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "daterange",
  "url",
  "email",
  "phone",
  "tag",
  "multi_tag",
  "status",
  "select",
  "multi_select",
  "rating",
  "file",
  "image",
  "checkbox",
  "relation",
  "formula",
  "rollup",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Property types whose config must define a fixed set of options (label + color). */
export const OPTION_BASED_PROPERTY_TYPES: readonly PropertyType[] = [
  "tag",
  "multi_tag",
  "status",
  "select",
  "multi_select",
];

/** Property types that store more than one value at a time. */
export const MULTI_VALUE_PROPERTY_TYPES: readonly PropertyType[] = [
  "multi_tag",
  "multi_select",
  "relation",
];

export interface PropertyOption {
  id: string;
  label: string;
  color: string;
}

/** Aggregation functions available on a "rollup" property. */
export const ROLLUP_FUNCTIONS = [
  "count",
  "sum",
  "average",
  "min",
  "max",
  "earliest",
  "latest",
] as const;
export type RollupFunction = (typeof ROLLUP_FUNCTIONS)[number];

/**
 * Discriminated config per property type. Stored as JSON on the `properties` row.
 * Kept intentionally small: formulas are a restricted arithmetic expression
 * language (see `packages/server/src/modules/properties/formula.ts`), not a
 * full scripting language.
 */
export type PropertyConfig =
  | { type: "text" | "url" | "email" | "phone" }
  | { type: "number"; precision?: number }
  | { type: "boolean" | "checkbox" }
  | { type: "date" | "datetime" }
  /** Start/end date pair (no time component) - e.g. a multi-day event or a vacation. Stored as `{ start, end }` (both "YYYY-MM-DD") in `object_values.value`. */
  | { type: "daterange" }
  | { type: "tag" | "multi_tag" | "status" | "select" | "multi_select"; options: PropertyOption[] }
  | { type: "rating"; max: number }
  | { type: "file" | "image" }
  | { type: "relation"; targetObjectTypeId: string | null; twoWay: boolean }
  | { type: "formula"; expression: string }
  | { type: "rollup"; relationPropertyId: string; sourcePropertyId: string; function: RollupFunction };
