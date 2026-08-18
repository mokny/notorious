import type { ModuleSdk } from "../manifest.js";
import type { VermieterCustomCostCategoryRow } from "../db/types.js";
import { VERMIETER_COST_CATEGORIES, type VermieterCostCategory } from "../db/costCategories.js";
import { isCategoryDefaultAllocationKey, type CategoryDefaultAllocationKey } from "./categoryAllocationDefaults.js";

/**
 * Workspace-defined custom cost categories - additive to the hardcoded
 * VERMIETER_COST_CATEGORIES list (see db/costCategories.ts), for a cost type
 * a specific landlord's building needs that the built-in list doesn't cover.
 * Same metadata shape as a built-in category (label, apportionable,
 * defaultAllocationKey, taxDeductibleDefault) - see migrations/0015.
 *
 * This file owns two related concerns:
 *  - CRUD for a workspace's own custom categories (create/list/update/
 *    archive/delete - see below),
 *  - the merge layer every OTHER call site in this module that needs "the
 *    full category list" or "look up one category by key" should go
 *    through instead of touching VERMIETER_COST_CATEGORIES/getCostCategory
 *    directly: `listAllCostCategoriesForWorkspace` and `resolveCostCategory`.
 *    Both are plain synchronous functions (better-sqlite3 is sync), so
 *    every caller of the old sync helpers can switch over without becoming
 *    async.
 */

/** A merged built-in-or-custom category entry, as returned by listAllCostCategoriesForWorkspace/resolveCostCategory. */
export interface MergedCostCategory extends VermieterCostCategory {
  /** True for a workspace's own custom category, false for one of the hardcoded VERMIETER_COST_CATEGORIES - lets callers (e.g. the future settings UI) restrict editing/archiving to custom ones only. */
  isCustom: boolean;
  /** Only set for a custom category (isCustom: true) - null for built-ins, which are never archived. */
  archivedAt: string | null;
}

function rowToMerged(row: VermieterCustomCostCategoryRow): MergedCostCategory {
  return {
    key: row.key,
    label: row.label,
    defaultAllocationKey: row.default_allocation_key,
    apportionable: row.apportionable === 1,
    taxDeductibleDefault: row.tax_deductible_default === 1,
    isCustom: true,
    archivedAt: row.archived_at,
  };
}

function builtInToMerged(category: VermieterCostCategory): MergedCostCategory {
  return { ...category, isCustom: false, archivedAt: null };
}

/** Diacritics-stripped, lowercased, hyphenated slug base - e.g. "Wärmepumpen-Wartung" -> "waermepumpen-wartung"... actually plain NFKD stripping turns "ä" into "a" (combining mark dropped), not "ae" - see the doc comment below on that tradeoff. */
function slugBase(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks (ä -> a, ö -> o, ü -> u, ß stays ß)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function existingKeys(sdk: ModuleSdk, workspaceId: string): Set<string> {
  const builtIn = VERMIETER_COST_CATEGORIES.map((c) => c.key);
  const customRows = sdk.sqlite.prepare("SELECT key FROM vermieter_custom_cost_categories WHERE workspace_id = ?").all(workspaceId) as {
    key: string;
  }[];
  return new Set([...builtIn, ...customRows.map((r) => r.key)]);
}

/** Auto-generates a unique-per-workspace slug from a label, colliding against both the built-in categories' keys and this workspace's other custom categories' keys (including archived ones, since an archived key must never be reused for a different category) - appends "-2", "-3", ... on collision, per this pass's brief. */
function generateUniqueKey(sdk: ModuleSdk, workspaceId: string, label: string): string {
  const base = slugBase(label) || "kategorie";
  const taken = existingKeys(sdk, workspaceId);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

/**
 * Every category available to a workspace: the hardcoded built-ins plus
 * that workspace's own custom categories (non-archived by default) - the
 * merged shape callers like a future category picker UI or
 * category-allocation-defaults' GET consume. Built-ins are always first, in
 * their fixed order, followed by custom categories ordered by creation.
 */
export function listAllCostCategoriesForWorkspace(
  sdk: ModuleSdk,
  workspaceId: string,
  options?: { includeArchived?: boolean },
): MergedCostCategory[] {
  const rows = sdk.sqlite
    .prepare(
      `SELECT * FROM vermieter_custom_cost_categories WHERE workspace_id = ? ${options?.includeArchived ? "" : "AND archived_at IS NULL"} ORDER BY created_at ASC`,
    )
    .all(workspaceId) as VermieterCustomCostCategoryRow[];
  return [...VERMIETER_COST_CATEGORIES.map(builtInToMerged), ...rows.map(rowToMerged)];
}

/**
 * Looks up one category (built-in or custom) by key for a workspace - the
 * single resolver every read-site of "this category's metadata" (label,
 * apportionable, taxDeductibleDefault, defaultAllocationKey) should call
 * instead of indexing VERMIETER_COST_CATEGORIES/getCostCategory directly,
 * now that a key might resolve to a workspace-specific custom category.
 * Built-ins are checked first (cheap, in-memory); archived custom
 * categories still resolve here (see migrations/0015's doc comment - a
 * receipt/statement-line already referencing an archived key must keep
 * rendering its real label), only `listAllCostCategoriesForWorkspace`'s
 * default `includeArchived: false` hides them from future selection.
 */
export function resolveCostCategory(sdk: ModuleSdk, workspaceId: string, key: string): MergedCostCategory | undefined {
  const builtIn = VERMIETER_COST_CATEGORIES.find((c) => c.key === key);
  if (builtIn) return builtInToMerged(builtIn);
  const row = sdk.sqlite
    .prepare("SELECT * FROM vermieter_custom_cost_categories WHERE workspace_id = ? AND key = ?")
    .get(workspaceId, key) as VermieterCustomCostCategoryRow | undefined;
  return row ? rowToMerged(row) : undefined;
}

/**
 * Builds a plain `key -> label` lookup map for a workspace (built-ins +
 * custom, including archived ones - a PDF rendering an old statement/receipt
 * must still show a real label for an archived category) - the shape
 * pdf/render.ts, pdf/explanationText.ts, pdf/receiptsExportPdf.ts, and
 * pdf/taxOverviewPdf.ts all take instead of importing db/costCategories.ts
 * directly, since those pure rendering functions have no sdk/DB access
 * themselves (see this pass's report for why: resolving once per request at
 * the route layer keeps the renderers pure and workspace-agnostic).
 */
export function buildCostCategoryLabelMap(sdk: ModuleSdk, workspaceId: string): Record<string, string> {
  const all = listAllCostCategoriesForWorkspace(sdk, workspaceId, { includeArchived: true });
  const map: Record<string, string> = {};
  for (const category of all) map[category.key] = category.label;
  return map;
}

export interface CustomCostCategoryDto {
  key: string;
  label: string;
  apportionable: boolean;
  defaultAllocationKey: CategoryDefaultAllocationKey;
  taxDeductibleDefault: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

function customRowToDto(row: VermieterCustomCostCategoryRow): CustomCostCategoryDto {
  return {
    key: row.key,
    label: row.label,
    apportionable: row.apportionable === 1,
    defaultAllocationKey: row.default_allocation_key,
    taxDeductibleDefault: row.tax_deductible_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

/** A workspace's own custom categories - non-archived by default (see `includeArchived`). Built-ins are never returned here (see listAllCostCategoriesForWorkspace for the merged view). */
export function listCustomCostCategories(sdk: ModuleSdk, workspaceId: string, options?: { includeArchived?: boolean }): CustomCostCategoryDto[] {
  const rows = sdk.sqlite
    .prepare(
      `SELECT * FROM vermieter_custom_cost_categories WHERE workspace_id = ? ${options?.includeArchived ? "" : "AND archived_at IS NULL"} ORDER BY created_at ASC`,
    )
    .all(workspaceId) as VermieterCustomCostCategoryRow[];
  return rows.map(customRowToDto);
}

function getCustomCostCategoryRow(sdk: ModuleSdk, workspaceId: string, key: string): VermieterCustomCostCategoryRow | undefined {
  return sdk.sqlite.prepare("SELECT * FROM vermieter_custom_cost_categories WHERE workspace_id = ? AND key = ?").get(workspaceId, key) as
    | VermieterCustomCostCategoryRow
    | undefined;
}

export function getCustomCostCategory(sdk: ModuleSdk, workspaceId: string, key: string): CustomCostCategoryDto | null {
  const row = getCustomCostCategoryRow(sdk, workspaceId, key);
  return row ? customRowToDto(row) : null;
}

export interface CustomCostCategoryInput {
  label: string;
  apportionable: boolean;
  defaultAllocationKey: CategoryDefaultAllocationKey;
  taxDeductibleDefault: boolean;
}

/** Creates a new custom category, auto-generating its (immutable) key from the label - see generateUniqueKey. */
export function createCustomCostCategory(sdk: ModuleSdk, workspaceId: string, input: CustomCostCategoryInput): CustomCostCategoryDto {
  const key = generateUniqueKey(sdk, workspaceId, input.label);
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_custom_cost_categories
       (id, workspace_id, key, label, apportionable, default_allocation_key, tax_deductible_default, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(id, workspaceId, key, input.label.trim(), input.apportionable ? 1 : 0, input.defaultAllocationKey, input.taxDeductibleDefault ? 1 : 0, now, now);
  return getCustomCostCategory(sdk, workspaceId, key)!;
}

export interface UpdateCustomCostCategoryResult {
  ok: boolean;
  reason?: "not_found";
  entry?: CustomCostCategoryDto;
}

/** Edits label/apportionable/defaultAllocationKey/taxDeductibleDefault - `key` itself is immutable (see migrations/0015's doc comment) and not accepted here. */
export function updateCustomCostCategory(
  sdk: ModuleSdk,
  workspaceId: string,
  key: string,
  input: Partial<CustomCostCategoryInput>,
): UpdateCustomCostCategoryResult {
  const existing = getCustomCostCategoryRow(sdk, workspaceId, key);
  if (!existing) return { ok: false, reason: "not_found" };
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE vermieter_custom_cost_categories SET
       label = ?, apportionable = ?, default_allocation_key = ?, tax_deductible_default = ?, updated_at = ?
       WHERE workspace_id = ? AND key = ?`,
    )
    .run(
      input.label !== undefined ? input.label.trim() : existing.label,
      (input.apportionable ?? existing.apportionable === 1) ? 1 : 0,
      input.defaultAllocationKey ?? existing.default_allocation_key,
      (input.taxDeductibleDefault ?? existing.tax_deductible_default === 1) ? 1 : 0,
      now,
      workspaceId,
      key,
    );
  return { ok: true, entry: getCustomCostCategory(sdk, workspaceId, key)! };
}

/**
 * Whether `key` (a custom category's key) is referenced anywhere else in
 * this workspace's data - receipts, circuit/category external-billing
 * settings, category-allocation-default overrides, external cost
 * allocations, or persisted statement lines. Used by `deleteCustomCostCategory`
 * to decide hard-delete vs. archive - see that function's doc comment.
 */
function isCustomCategoryKeyReferenced(sdk: ModuleSdk, workspaceId: string, key: string): boolean {
  const checks: [string, string][] = [
    ["vermieter_receipts", "workspace_id = ? AND cost_category_key = ?"],
    ["vermieter_circuit_category_settings", "workspace_id = ? AND cost_category_key = ?"],
    ["vermieter_category_allocation_defaults", "workspace_id = ? AND cost_category_key = ?"],
    ["vermieter_external_cost_allocations", "workspace_id = ? AND cost_category_key = ?"],
  ];
  for (const [table, where] of checks) {
    const row = sdk.sqlite.prepare(`SELECT 1 FROM ${table} WHERE ${where} LIMIT 1`).get(workspaceId, key);
    if (row) return true;
  }
  // Statement lines aren't workspace-scoped directly (see
  // vermieter_statement_lines' schema) - join through vermieter_statements
  // to scope the check to this workspace.
  const statementLine = sdk.sqlite
    .prepare(
      `SELECT 1 FROM vermieter_statement_lines
       WHERE cost_category_key = ? AND statement_id IN (SELECT id FROM vermieter_statements WHERE workspace_id = ?)
       LIMIT 1`,
    )
    .get(key, workspaceId);
  return !!statementLine;
}

export interface DeleteCustomCostCategoryResult {
  deleted: boolean;
  archived: boolean;
  reason?: "not_found";
}

/**
 * Removes a custom category. A category that has never been referenced by
 * any receipt/circuit-category-setting/category-allocation-default/external-
 * allocation/statement-line is hard-deleted outright (the common "created by
 * mistake, never used" case, avoiding permanent clutter for something that
 * never mattered); one that IS referenced anywhere is archived instead
 * (`archived_at` set, hidden from future selection by
 * listAllCostCategoriesForWorkspace's default) rather than rejected, since
 * that existing data must keep resolving to a real label/metadata via
 * resolveCostCategory - see migrations/0015's doc comment. This mirrors the
 * "soft delete unless provably unused" pattern the brief asked to choose
 * and document.
 */
export function deleteCustomCostCategory(sdk: ModuleSdk, workspaceId: string, key: string): DeleteCustomCostCategoryResult {
  const existing = getCustomCostCategoryRow(sdk, workspaceId, key);
  if (!existing) return { deleted: false, archived: false, reason: "not_found" };

  if (isCustomCategoryKeyReferenced(sdk, workspaceId, key)) {
    const now = sdk.nowIso();
    sdk.sqlite
      .prepare("UPDATE vermieter_custom_cost_categories SET archived_at = ?, updated_at = ? WHERE workspace_id = ? AND key = ?")
      .run(now, now, workspaceId, key);
    return { deleted: false, archived: true };
  }

  sdk.sqlite.prepare("DELETE FROM vermieter_custom_cost_categories WHERE workspace_id = ? AND key = ?").run(workspaceId, key);
  return { deleted: true, archived: false };
}

export { isCategoryDefaultAllocationKey };

/** Purge helper for services/reset.ts::resetVermieterData's whole-module path - deletes every custom category for the workspace, unconditionally (no soft-delete concept applies to a full module purge). Not called from the property-scoped reset scopes (services/reset.ts::resetPropertiesScope and friends) - custom categories are workspace-wide settings, not property-scoped, so a property reset must not remove them. */
export function purgeCustomCostCategories(sdk: ModuleSdk, workspaceId: string): void {
  sdk.sqlite.prepare("DELETE FROM vermieter_custom_cost_categories WHERE workspace_id = ?").run(workspaceId);
}
