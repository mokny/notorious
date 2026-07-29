/** All supported view types over a collection of objects. */
export const VIEW_TYPES = ["table", "board", "timeline", "gallery", "calendar", "list"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export const FILTER_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "less_than",
  "on_or_after",
  "on_or_before",
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export interface ViewFilter {
  propertyId: string;
  operator: FilterOperator;
  value?: string | number | boolean | string[] | null;
}

export interface ViewSort {
  propertyId: string;
  direction: "asc" | "desc";
}

/** Persisted, per-view configuration. All view types query the same object data. */
export interface ViewConfig {
  filters: ViewFilter[];
  sorts: ViewSort[];
  groupByPropertyId?: string | null;
  /** For board/calendar/timeline: which property drives the columns/axis. */
  pivotPropertyId?: string | null;
  visiblePropertyIds: string[];
}
