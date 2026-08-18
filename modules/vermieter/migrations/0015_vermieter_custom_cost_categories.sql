-- Vermieter module - workspace-defined custom cost categories, additive to
-- the hardcoded VERMIETER_COST_CATEGORIES list in db/costCategories.ts. A
-- landlord's building may have a cost type the built-in list doesn't cover
-- (e.g. a specific service contract); this table lets them define their own,
-- with the same metadata shape (label, apportionable, default allocation
-- key, tax-deductible default) the built-ins carry, merged in everywhere via
-- services/customCostCategories.ts's listAllCostCategoriesForWorkspace/
-- resolveCostCategory.
--
-- `key` is a slug auto-generated from the label at creation time (lowercase,
-- diacritics stripped, hyphenated, de-duplicated against both the built-in
-- keys and this workspace's other custom keys with a numeric suffix) and is
-- immutable afterwards - receipts, circuit/category settings, and category-
-- allocation-default overrides all reference it by key, so it can never be
-- renamed once created (only the display `label` can change).
--
-- `default_allocation_key` intentionally excludes 'external_provider' via
-- the CHECK constraint - same restriction migrations/0014 already applies to
-- vermieter_category_allocation_defaults, since 'external_provider' is
-- opted into per (cost circuit, cost category), never a category-level
-- default.
--
-- `archived_at` is a soft-delete: a custom category already referenced by a
-- receipt, circuit/category setting, category-allocation-default override,
-- external cost allocation, or a finalized statement line must stay
-- resolvable (see resolveCostCategory) even after removal from future
-- selection - see services/customCostCategories.ts's delete-vs-archive doc
-- comment for when a genuinely-unused category is hard-deleted instead.
--
-- No FK constraints - same module convention as every other table here (see
-- migrations/0001's doc comment).
CREATE TABLE vermieter_custom_cost_categories (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  apportionable INTEGER NOT NULL DEFAULT 1,
  default_allocation_key TEXT NOT NULL CHECK (default_allocation_key IN ('sqm', 'persons', 'units', 'consumption', 'fixed_manual')),
  tax_deductible_default INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE UNIQUE INDEX idx_vermieter_custom_cost_categories_unique_key ON vermieter_custom_cost_categories(workspace_id, key);
