import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { vermieterApi, type CustomCostCategoryDto } from "../api.js";
import { VERMIETER_COST_CATEGORIES, type VermieterCostCategory } from "../../db/costCategories.js";

/** A merged built-in-or-custom category, as consumed by every Vermieter page - mirrors services/customCostCategories.ts's MergedCostCategory on the server. */
export interface MergedVermieterCostCategory extends VermieterCostCategory {
  /** True for a workspace's own custom category, false for one of the hardcoded VERMIETER_COST_CATEGORIES. */
  isCustom: boolean;
  /** Only set for a custom category - null for built-ins, which are never archived. */
  archivedAt: string | null;
}

function customToMerged(row: CustomCostCategoryDto): MergedVermieterCostCategory {
  return {
    key: row.key,
    label: row.label,
    defaultAllocationKey: row.defaultAllocationKey,
    apportionable: row.apportionable,
    taxDeductibleDefault: row.taxDeductibleDefault,
    isCustom: true,
    archivedAt: row.archivedAt,
  };
}

function builtInToMerged(category: VermieterCostCategory): MergedVermieterCostCategory {
  return { ...category, isCustom: false, archivedAt: null };
}

export const VERMIETER_CUSTOM_CATEGORIES_QUERY_KEY = (workspaceId: string) => ["module-vermieter-custom-cost-categories", workspaceId, "all"];

/**
 * The one hook every Vermieter page/component should use instead of
 * importing VERMIETER_COST_CATEGORIES/getCostCategory directly, now that a
 * workspace may have its own custom cost categories on top of the hardcoded
 * built-ins (see routes/services/customCostCategories.ts). Fetches a
 * workspace's custom categories ONCE (including archived ones, so
 * `getCategory`/`getCategoryLabel` can still resolve an old receipt/
 * statement line that references an archived custom category - see
 * services/customCostCategories.ts::resolveCostCategory's doc comment for
 * why that must keep working) and derives everything else from that single
 * result:
 *  - `categories`: built-ins + this workspace's ACTIVE (non-archived) custom
 *    categories, in this order - the list every category picker should map
 *    over.
 *  - `customCategories`/`archivedCustomCategories`: for a settings-style
 *    management panel that needs to list them separately.
 *  - `getCategory`/`getCategoryLabel`: look up any category (built-in,
 *    active custom, or archived custom) by key - for display sites that
 *    render a category already referenced by existing data, which must
 *    render a real label even once its custom category is archived.
 */
export function useVermieterCostCategories(workspaceId: string | undefined) {
  const { data: customCategories, isLoading } = useQuery({
    queryKey: VERMIETER_CUSTOM_CATEGORIES_QUERY_KEY(workspaceId ?? ""),
    queryFn: () => vermieterApi.customCostCategories.list(workspaceId!, true),
    enabled: Boolean(workspaceId),
  });

  const activeCustom = useMemo(() => (customCategories ?? []).filter((c) => !c.archivedAt).map(customToMerged), [customCategories]);
  const archivedCustom = useMemo(() => (customCategories ?? []).filter((c) => c.archivedAt).map(customToMerged), [customCategories]);

  const categories = useMemo<MergedVermieterCostCategory[]>(
    () => [...VERMIETER_COST_CATEGORIES.map(builtInToMerged), ...activeCustom],
    [activeCustom],
  );

  const byKey = useMemo(() => {
    const map = new Map<string, MergedVermieterCostCategory>();
    for (const category of VERMIETER_COST_CATEGORIES) map.set(category.key, builtInToMerged(category));
    for (const row of customCategories ?? []) map.set(row.key, customToMerged(row));
    return map;
  }, [customCategories]);

  return {
    /** Built-ins + active custom categories - what every picker should map over. */
    categories,
    /** This workspace's own active custom categories only (no built-ins) - for a management panel's "active" list. */
    customCategories: activeCustom,
    /** This workspace's own archived custom categories - for a management panel's read-only "archived" sub-list. */
    archivedCustomCategories: archivedCustom,
    getCategory: (key: string): MergedVermieterCostCategory | undefined => byKey.get(key),
    getCategoryLabel: (key: string): string => byKey.get(key)?.label ?? key,
    isLoading,
  };
}
