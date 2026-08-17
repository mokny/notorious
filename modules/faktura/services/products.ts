import { generateKeyBetween } from "fractional-indexing";
import type { ModuleSdk } from "../manifest.js";
import type {
  FakturaProductRow,
  FakturaProductPriceTierRow,
  FakturaCustomerProductPriceRow,
  FakturaProductUnit,
  FakturaTaxRateBasisPoints,
} from "../db/types.js";

export interface PriceTierDto {
  id: string;
  minQuantity: number;
  priceCents: number;
}

export interface CustomerPriceDto {
  id: string;
  customerId: string;
  priceCents: number;
  effectiveFrom: string;
}

export interface ProductDto {
  id: string;
  name: string;
  description: string;
  unit: FakturaProductUnit;
  unitLabel: string;
  basePriceCents: number;
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
  sku: string;
  posEnabled: boolean;
  posCategory: string;
  posFavorite: boolean;
  posColor: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  priceTiers: PriceTierDto[];
  customerPrices: CustomerPriceDto[];
}

export interface ProductListItemDto {
  id: string;
  name: string;
  unit: FakturaProductUnit;
  basePriceCents: number;
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
  posEnabled: boolean;
  posCategory: string;
  posFavorite: boolean;
  posColor: string;
  archivedAt: string | null;
}

function tiersOf(sdk: ModuleSdk, productId: string): PriceTierDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_product_price_tiers WHERE product_id = ? ORDER BY min_quantity ASC")
    .all(productId) as FakturaProductPriceTierRow[];
  return rows.map((r) => ({ id: r.id, minQuantity: r.min_quantity, priceCents: r.price_cents }));
}

function customerPricesOf(sdk: ModuleSdk, productId: string): CustomerPriceDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_customer_product_prices WHERE product_id = ? ORDER BY effective_from DESC")
    .all(productId) as FakturaCustomerProductPriceRow[];
  return rows.map((r) => ({ id: r.id, customerId: r.customer_id, priceCents: r.price_cents, effectiveFrom: r.effective_from }));
}

function rowToDto(sdk: ModuleSdk, row: FakturaProductRow): ProductDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    unit: row.unit,
    unitLabel: row.unit_label,
    basePriceCents: row.base_price_cents,
    taxRateBasisPoints: row.tax_rate_basis_points,
    sku: row.sku,
    posEnabled: row.pos_enabled === 1,
    posCategory: row.pos_category,
    posFavorite: row.pos_favorite === 1,
    posColor: row.pos_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    priceTiers: tiersOf(sdk, row.id),
    customerPrices: customerPricesOf(sdk, row.id),
  };
}

function rowToListItem(row: FakturaProductRow): ProductListItemDto {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    basePriceCents: row.base_price_cents,
    taxRateBasisPoints: row.tax_rate_basis_points,
    posEnabled: row.pos_enabled === 1,
    posCategory: row.pos_category,
    posFavorite: row.pos_favorite === 1,
    posColor: row.pos_color,
    archivedAt: row.archived_at,
  };
}

export function listProducts(sdk: ModuleSdk, workspaceId: string, includeArchived = false): ProductListItemDto[] {
  const rows = sdk.sqlite
    .prepare(
      includeArchived
        ? "SELECT * FROM faktura_products WHERE workspace_id = ? ORDER BY name ASC"
        : "SELECT * FROM faktura_products WHERE workspace_id = ? AND archived_at IS NULL ORDER BY name ASC",
    )
    .all(workspaceId) as FakturaProductRow[];
  return rows.map(rowToListItem);
}

/** Products enabled for the POS terminal grid (see web/components/PosProductGrid.tsx), ordered by the shared drag-reorderable `pos_sort_key` (fractional index) - one order shared by the Favorites tab and every category tab, not a separate order per tab. Legacy rows with no key yet (empty string) sort first, ahead of anything explicitly ordered. */
export function listPosProducts(sdk: ModuleSdk, workspaceId: string): ProductListItemDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_products WHERE workspace_id = ? AND pos_enabled = 1 AND archived_at IS NULL ORDER BY pos_sort_key ASC, name ASC")
    .all(workspaceId) as FakturaProductRow[];
  return rows.map(rowToListItem);
}

export function getProduct(sdk: ModuleSdk, workspaceId: string, productId: string): ProductDto | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_products WHERE id = ? AND workspace_id = ?")
    .get(productId, workspaceId) as FakturaProductRow | undefined;
  return row ? rowToDto(sdk, row) : null;
}

/** Used by pricing/document services - throws if the product doesn't belong to this workspace. */
export function requireProduct(sdk: ModuleSdk, workspaceId: string, productId: string): FakturaProductRow {
  const row = sdk.sqlite
    .prepare("SELECT * FROM faktura_products WHERE id = ? AND workspace_id = ?")
    .get(productId, workspaceId) as FakturaProductRow | undefined;
  if (!row) throw new Error("Product not found");
  return row;
}

export interface ProductInput {
  name: string;
  description?: string;
  unit: FakturaProductUnit;
  unitLabel?: string;
  basePriceCents: number;
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
  sku?: string;
  posEnabled?: boolean;
  posCategory?: string;
  posFavorite?: boolean;
  /** Hex color (e.g. "#3b82f6") or empty string for an auto-generated color (see web/lib/posColor.ts). */
  posColor?: string;
  priceTiers?: Array<{ minQuantity: number; priceCents: number }>;
  customerPrices?: Array<{ customerId: string; priceCents: number; effectiveFrom: string }>;
}

function replaceTiers(sdk: ModuleSdk, productId: string, tiers: NonNullable<ProductInput["priceTiers"]>): void {
  sdk.sqlite.prepare("DELETE FROM faktura_product_price_tiers WHERE product_id = ?").run(productId);
  const now = sdk.nowIso();
  const insert = sdk.sqlite.prepare(
    "INSERT INTO faktura_product_price_tiers (id, product_id, min_quantity, price_cents, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const tier of tiers) {
    if (tier.minQuantity < 1) continue;
    insert.run(sdk.newId(), productId, tier.minQuantity, tier.priceCents, now);
  }
}

function replaceCustomerPrices(
  sdk: ModuleSdk,
  workspaceId: string,
  productId: string,
  prices: NonNullable<ProductInput["customerPrices"]>,
  actorId: string,
): void {
  const existing = sdk.sqlite
    .prepare("SELECT * FROM faktura_customer_product_prices WHERE product_id = ?")
    .all(productId) as FakturaCustomerProductPriceRow[];
  const existingByKey = new Map(existing.map((r) => [`${r.customer_id}:${r.effective_from}:${r.price_cents}`, r]));

  sdk.sqlite.prepare("DELETE FROM faktura_customer_product_prices WHERE product_id = ?").run(productId);
  const now = sdk.nowIso();
  const insert = sdk.sqlite.prepare(
    "INSERT INTO faktura_customer_product_prices (id, product_id, customer_id, price_cents, effective_from, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const price of prices) {
    insert.run(sdk.newId(), productId, price.customerId, price.priceCents, price.effectiveFrom, now);
    // Log to the shared price-history table only for genuinely new
    // customer-price rows, not on every save-with-unchanged-rows round trip.
    const key = `${price.customerId}:${price.effectiveFrom}:${price.priceCents}`;
    if (!existingByKey.has(key)) {
      recordPriceHistory(sdk, productId, price.customerId, price.priceCents, price.effectiveFrom, actorId);
    }
  }
  void workspaceId;
}

function recordPriceHistory(
  sdk: ModuleSdk,
  productId: string,
  customerId: string | null,
  priceCents: number,
  effectiveFrom: string,
  actorId: string,
): void {
  sdk.sqlite
    .prepare(
      "INSERT INTO faktura_price_history (id, product_id, customer_id, price_cents, effective_from, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(sdk.newId(), productId, customerId, priceCents, effectiveFrom, actorId, sdk.nowIso());
}

/** The current last `pos_sort_key` among this workspace's products, or null if none have one yet - used to append a newly created/enabled product to the end of the POS grid order. */
function lastPosSortKey(sdk: ModuleSdk, workspaceId: string): string | null {
  const row = sdk.sqlite
    .prepare("SELECT pos_sort_key FROM faktura_products WHERE workspace_id = ? AND pos_sort_key != '' ORDER BY pos_sort_key DESC LIMIT 1")
    .get(workspaceId) as { pos_sort_key: string } | undefined;
  return row?.pos_sort_key ?? null;
}

export function createProduct(sdk: ModuleSdk, workspaceId: string, input: ProductInput, actorId: string): ProductDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  const posSortKey = generateKeyBetween(lastPosSortKey(sdk, workspaceId), null);
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_products (id, workspace_id, name, description, unit, unit_label, base_price_cents, tax_rate_basis_points, sku, pos_enabled, pos_category, pos_favorite, pos_color, pos_sort_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      input.name.trim(),
      input.description ?? "",
      input.unit,
      input.unitLabel ?? "",
      input.basePriceCents,
      input.taxRateBasisPoints,
      input.sku ?? "",
      input.posEnabled ? 1 : 0,
      input.posCategory ?? "",
      input.posFavorite ? 1 : 0,
      input.posColor ?? "",
      posSortKey,
      now,
      now,
    );
  recordPriceHistory(sdk, id, null, input.basePriceCents, now, actorId);
  if (input.priceTiers) replaceTiers(sdk, id, input.priceTiers);
  if (input.customerPrices) replaceCustomerPrices(sdk, workspaceId, id, input.customerPrices, actorId);
  return getProduct(sdk, workspaceId, id)!;
}

export function updateProduct(sdk: ModuleSdk, workspaceId: string, productId: string, input: ProductInput, actorId: string): ProductDto | null {
  const existing = sdk.sqlite
    .prepare("SELECT base_price_cents FROM faktura_products WHERE id = ? AND workspace_id = ?")
    .get(productId, workspaceId) as Pick<FakturaProductRow, "base_price_cents"> | undefined;
  if (!existing) return null;

  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `UPDATE faktura_products SET name = ?, description = ?, unit = ?, unit_label = ?, base_price_cents = ?, tax_rate_basis_points = ?, sku = ?, pos_enabled = ?, pos_category = ?, pos_favorite = ?, pos_color = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .run(
      input.name.trim(),
      input.description ?? "",
      input.unit,
      input.unitLabel ?? "",
      input.basePriceCents,
      input.taxRateBasisPoints,
      input.sku ?? "",
      input.posEnabled ? 1 : 0,
      input.posCategory ?? "",
      input.posFavorite ? 1 : 0,
      input.posColor ?? "",
      now,
      productId,
      workspaceId,
    );

  if (input.basePriceCents !== existing.base_price_cents) {
    recordPriceHistory(sdk, productId, null, input.basePriceCents, now, actorId);
  }
  if (input.priceTiers) replaceTiers(sdk, productId, input.priceTiers);
  if (input.customerPrices) replaceCustomerPrices(sdk, workspaceId, productId, input.customerPrices, actorId);
  return getProduct(sdk, workspaceId, productId);
}

/**
 * Moves a product to just after `afterProductId` (or to the very front if
 * null) in the shared POS grid order, computing a fresh fractional-index
 * key between its new neighbors - see migrations/0012's doc comment. The
 * neighbors are read from the full pos-enabled product list (not whichever
 * tab the drag happened in), so dragging within the Favorites tab still
 * produces a globally consistent order.
 */
export function reorderPosProduct(sdk: ModuleSdk, workspaceId: string, productId: string, afterProductId: string | null): boolean {
  const target = sdk.sqlite.prepare("SELECT id FROM faktura_products WHERE id = ? AND workspace_id = ?").get(productId, workspaceId);
  if (!target) return false;

  const siblings = (
    sdk.sqlite
      .prepare("SELECT id, pos_sort_key FROM faktura_products WHERE workspace_id = ? AND id != ? AND pos_enabled = 1 AND archived_at IS NULL ORDER BY pos_sort_key ASC, name ASC")
      .all(workspaceId, productId) as Array<{ id: string; pos_sort_key: string }>
  );

  const afterIndex = afterProductId ? siblings.findIndex((s) => s.id === afterProductId) : -1;
  const afterKey = afterIndex >= 0 ? siblings[afterIndex]!.pos_sort_key : null;
  const beforeKey = siblings[afterIndex + 1]?.pos_sort_key ?? null;
  const newKey = generateKeyBetween(afterKey, beforeKey);

  sdk.sqlite.prepare("UPDATE faktura_products SET pos_sort_key = ? WHERE id = ? AND workspace_id = ?").run(newKey, productId, workspaceId);
  return true;
}

export function archiveProduct(sdk: ModuleSdk, workspaceId: string, productId: string): boolean {
  const result = sdk.sqlite
    .prepare("UPDATE faktura_products SET archived_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
    .run(sdk.nowIso(), sdk.nowIso(), productId, workspaceId);
  return result.changes > 0;
}

export function getPriceHistory(sdk: ModuleSdk, productId: string): Array<{ customerId: string | null; priceCents: number; effectiveFrom: string; createdAt: string }> {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_price_history WHERE product_id = ? ORDER BY effective_from DESC, created_at DESC")
    .all(productId) as Array<{ customer_id: string | null; price_cents: number; effective_from: string; created_at: string }>;
  return rows.map((r) => ({ customerId: r.customer_id, priceCents: r.price_cents, effectiveFrom: r.effective_from, createdAt: r.created_at }));
}
