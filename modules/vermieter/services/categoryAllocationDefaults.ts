import type { ModuleSdk } from "../manifest.js";
import { VERMIETER_COST_CATEGORIES, getCostCategory } from "../db/costCategories.js";
import type { VermieterAllocationKey } from "../db/types.js";

/**
 * Per-workspace override of a cost category's default allocation key - see
 * migrations/0014's doc comment. Absence of a row for a (workspace, category)
 * pair means "use the hardcoded VERMIETER_COST_CATEGORIES default", not
 * "unset" - `resolveCategoryDefaultAllocationKey` below is the one place
 * that merges the two, and every reader of a category's *effective* default
 * (services/statementCalculation.ts via services/statements.ts,
 * GET .../category-allocation-defaults) goes through it rather than reading
 * the hardcoded constant directly.
 */

/** The subset of VermieterAllocationKey a category-level default may be - deliberately excludes 'external_provider', which is opted into per (circuit, category), not a category default (see migrations/0014). */
export type CategoryDefaultAllocationKey = Exclude<VermieterAllocationKey, "external_provider">;

const OVERRIDABLE_ALLOCATION_KEYS: CategoryDefaultAllocationKey[] = ["sqm", "persons", "units", "consumption", "fixed_manual"];

export function isCategoryDefaultAllocationKey(value: unknown): value is CategoryDefaultAllocationKey {
  return typeof value === "string" && (OVERRIDABLE_ALLOCATION_KEYS as string[]).includes(value);
}

interface VermieterCategoryAllocationDefaultRow {
  id: string;
  workspace_id: string;
  cost_category_key: string;
  allocation_key: CategoryDefaultAllocationKey;
  updated_at: string;
}

/** One category's effective default allocation key for a workspace, merging a workspace override (if any) with the hardcoded built-in default - see the module doc comment above. */
export interface CategoryAllocationDefaultDto {
  costCategoryKey: string;
  /** The category's built-in default from VERMIETER_COST_CATEGORIES, for display/comparison. */
  builtInAllocationKey: CategoryDefaultAllocationKey;
  /** The value actually in effect for this workspace: the override if one exists, else builtInAllocationKey. */
  allocationKey: CategoryDefaultAllocationKey;
  /** True when a workspace override row exists (i.e. `allocationKey` differs from `builtInAllocationKey` by explicit choice, not coincidence). */
  isOverridden: boolean;
  updatedAt: string | null;
}

function overrideRow(sdk: ModuleSdk, workspaceId: string, costCategoryKey: string): VermieterCategoryAllocationDefaultRow | undefined {
  return sdk.sqlite
    .prepare("SELECT * FROM vermieter_category_allocation_defaults WHERE workspace_id = ? AND cost_category_key = ?")
    .get(workspaceId, costCategoryKey) as VermieterCategoryAllocationDefaultRow | undefined;
}

/**
 * The single resolver every read-site of "this category's default allocation
 * key" should call (see the module doc comment) - a workspace override takes
 * priority, falling back to the hardcoded VERMIETER_COST_CATEGORIES default,
 * and finally to 'sqm' if the category key itself is unknown (matching the
 * pre-existing fallback in statementCalculation.ts).
 */
export function resolveCategoryDefaultAllocationKey(sdk: ModuleSdk, workspaceId: string, costCategoryKey: string): VermieterAllocationKey {
  const override = overrideRow(sdk, workspaceId, costCategoryKey);
  if (override) return override.allocation_key;
  return getCostCategory(costCategoryKey)?.defaultAllocationKey ?? "sqm";
}

/**
 * Builds a workspace-wide lookup map ({@link resolveCategoryDefaultAllocationKey}
 * for every known category in one pass) - used by
 * services/statementCalculation.ts's caller (services/statements.ts) so the
 * pure calculation engine itself never needs sdk/DB access, just a
 * precomputed map.
 */
export function resolveAllCategoryDefaultAllocationKeys(sdk: ModuleSdk, workspaceId: string): Map<string, VermieterAllocationKey> {
  const overrides = sdk.sqlite
    .prepare("SELECT * FROM vermieter_category_allocation_defaults WHERE workspace_id = ?")
    .all(workspaceId) as VermieterCategoryAllocationDefaultRow[];
  const overrideByCategory = new Map(overrides.map((row) => [row.cost_category_key, row.allocation_key]));
  const map = new Map<string, VermieterAllocationKey>();
  for (const category of VERMIETER_COST_CATEGORIES) {
    map.set(category.key, overrideByCategory.get(category.key) ?? category.defaultAllocationKey);
  }
  return map;
}

/** One entry per known cost category, pre-filled with its current effective default - see GET .../category-allocation-defaults. */
export function listCategoryAllocationDefaults(sdk: ModuleSdk, workspaceId: string): CategoryAllocationDefaultDto[] {
  const overrides = sdk.sqlite
    .prepare("SELECT * FROM vermieter_category_allocation_defaults WHERE workspace_id = ?")
    .all(workspaceId) as VermieterCategoryAllocationDefaultRow[];
  const overrideByCategory = new Map(overrides.map((row) => [row.cost_category_key, row]));
  return VERMIETER_COST_CATEGORIES.map((category) => {
    const override = overrideByCategory.get(category.key);
    return {
      costCategoryKey: category.key,
      builtInAllocationKey: category.defaultAllocationKey as CategoryDefaultAllocationKey,
      allocationKey: override?.allocation_key ?? (category.defaultAllocationKey as CategoryDefaultAllocationKey),
      isOverridden: !!override,
      updatedAt: override?.updated_at ?? null,
    };
  });
}

export interface SetCategoryAllocationDefaultResult {
  ok: boolean;
  reason?: "unknown_category";
  entry?: CategoryAllocationDefaultDto;
}

/** Sets (creates or updates) a workspace's override for one category. Returns `unknown_category` rather than throwing when `costCategoryKey` isn't one of VERMIETER_COST_CATEGORIES's keys, so the route can turn that into a 404. */
export function setCategoryAllocationDefault(
  sdk: ModuleSdk,
  workspaceId: string,
  costCategoryKey: string,
  allocationKey: CategoryDefaultAllocationKey,
): SetCategoryAllocationDefaultResult {
  const category = getCostCategory(costCategoryKey);
  if (!category) return { ok: false, reason: "unknown_category" };
  const now = sdk.nowIso();
  const existing = overrideRow(sdk, workspaceId, costCategoryKey);
  if (existing) {
    sdk.sqlite
      .prepare("UPDATE vermieter_category_allocation_defaults SET allocation_key = ?, updated_at = ? WHERE id = ?")
      .run(allocationKey, now, existing.id);
  } else {
    sdk.sqlite
      .prepare(
        `INSERT INTO vermieter_category_allocation_defaults (id, workspace_id, cost_category_key, allocation_key, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(sdk.newId(), workspaceId, costCategoryKey, allocationKey, now);
  }
  return {
    ok: true,
    entry: {
      costCategoryKey,
      builtInAllocationKey: category.defaultAllocationKey as CategoryDefaultAllocationKey,
      allocationKey,
      isOverridden: true,
      updatedAt: now,
    },
  };
}

export interface ResetCategoryAllocationDefaultResult {
  ok: boolean;
  reason?: "unknown_category";
  entry?: CategoryAllocationDefaultDto;
}

/** Removes a workspace's override for one category, reverting its effective default back to the hardcoded built-in value. A no-op (not an error) if no override existed. */
export function resetCategoryAllocationDefault(sdk: ModuleSdk, workspaceId: string, costCategoryKey: string): ResetCategoryAllocationDefaultResult {
  const category = getCostCategory(costCategoryKey);
  if (!category) return { ok: false, reason: "unknown_category" };
  sdk.sqlite
    .prepare("DELETE FROM vermieter_category_allocation_defaults WHERE workspace_id = ? AND cost_category_key = ?")
    .run(workspaceId, costCategoryKey);
  return {
    ok: true,
    entry: {
      costCategoryKey,
      builtInAllocationKey: category.defaultAllocationKey as CategoryDefaultAllocationKey,
      allocationKey: category.defaultAllocationKey as CategoryDefaultAllocationKey,
      isOverridden: false,
      updatedAt: null,
    },
  };
}
