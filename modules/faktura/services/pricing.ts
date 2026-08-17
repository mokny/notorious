import type { ModuleSdk } from "../manifest.js";
import type { FakturaCustomerProductPriceRow, FakturaProductPriceTierRow, FakturaProductRow } from "../db/types.js";

/**
 * Resolves the unit price (in cents) for a product/customer/quantity/date
 * combination, in precedence order:
 *   1. Customer-specific override price effective on `asOfDate` (the most
 *      recent `effective_from` that is <= `asOfDate` wins).
 *   2. Quantity price tier: the highest `min_quantity` that is <= `quantity`.
 *   3. The product's plain base price.
 * Used both by the document line editor (to prefill a price when a product
 * is picked) and, authoritatively, by the server when a document is saved -
 * the client's own total preview is never trusted.
 */
export function resolveUnitPrice(sdk: ModuleSdk, productId: string, customerId: string | null, quantity: number, asOfDate: string): number {
  const product = sdk.sqlite.prepare("SELECT * FROM faktura_products WHERE id = ?").get(productId) as FakturaProductRow | undefined;
  if (!product) throw new Error("Product not found");

  if (customerId) {
    const customerPrice = sdk.sqlite
      .prepare(
        "SELECT * FROM faktura_customer_product_prices WHERE product_id = ? AND customer_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1",
      )
      .get(productId, customerId, asOfDate) as FakturaCustomerProductPriceRow | undefined;
    if (customerPrice) return customerPrice.price_cents;
  }

  const tier = sdk.sqlite
    .prepare("SELECT * FROM faktura_product_price_tiers WHERE product_id = ? AND min_quantity <= ? ORDER BY min_quantity DESC LIMIT 1")
    .get(productId, quantity) as FakturaProductPriceTierRow | undefined;
  if (tier) return tier.price_cents;

  return product.base_price_cents;
}
