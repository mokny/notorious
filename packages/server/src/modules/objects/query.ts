import type { ViewFilter, ViewSort, PropertyValue } from "@notorious/shared";

/**
 * In-process filter/sort engine for the EAV object model. `queryObjects` (in
 * service.ts) resolves a bounded set of candidate objects and their values,
 * then this module applies the view's filters/sorts over that resolved set.
 * See docs/ROADMAP.md: pushing filters down into SQL for 100k+ row workspaces
 * is a documented follow-up, not part of the foundation.
 */
export const MAX_SCAN = 5000;

function matches(value: PropertyValue, filter: ViewFilter): boolean {
  const { operator, value: target } = filter;

  switch (operator) {
    case "is_empty":
      return value === null || value === "" || (Array.isArray(value) && value.length === 0);
    case "is_not_empty":
      return !(value === null || value === "" || (Array.isArray(value) && value.length === 0));
    case "equals":
      return Array.isArray(value) ? value.includes(String(target)) : value === target;
    case "not_equals":
      return Array.isArray(value) ? !value.includes(String(target)) : value !== target;
    case "contains":
      if (Array.isArray(value)) return value.some((v) => v.includes(String(target ?? "")));
      return String(value ?? "")
        .toLowerCase()
        .includes(String(target ?? "").toLowerCase());
    case "not_contains":
      return !String(value ?? "")
        .toLowerCase()
        .includes(String(target ?? "").toLowerCase());
    case "greater_than":
      return Number(value) > Number(target);
    case "less_than":
      return Number(value) < Number(target);
    case "on_or_after":
      return String(value ?? "") >= String(target ?? "");
    case "on_or_before":
      return String(value ?? "") <= String(target ?? "");
    default:
      return true;
  }
}

export function applyFilters(
  values: Record<string, PropertyValue>,
  filters: ViewFilter[],
  keyByPropertyId: Map<string, string>,
): boolean {
  return filters.every((filter) => {
    const key = keyByPropertyId.get(filter.propertyId);
    if (!key) return true;
    return matches(values[key] ?? null, filter);
  });
}

export function compareForSort(
  a: Record<string, PropertyValue>,
  b: Record<string, PropertyValue>,
  sorts: ViewSort[],
  keyByPropertyId: Map<string, string>,
): number {
  for (const sort of sorts) {
    const key = keyByPropertyId.get(sort.propertyId);
    if (!key) continue;
    const av = a[key];
    const bv = b[key];
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    if (cmp !== 0) return sort.direction === "asc" ? cmp : -cmp;
  }
  return 0;
}
