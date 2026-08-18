import type { ModuleSdk } from "../manifest.js";
import { requireProperty } from "./properties.js";
import { listUnits } from "./units.js";
import { listLeasesOverlappingPeriod } from "./leases.js";
import { listRentPaymentsInPeriod } from "./rentPayments.js";
import type { VermieterReceiptRow } from "../db/types.js";

export interface TaxOverviewDto {
  propertyId: string;
  year: number;
  rentIncomeCents: number;
  deductibleExpensesCents: number;
  afaCents: number;
  afaRatePercent: number;
  netResultCents: number;
  expensesByCategoryKey: { costCategoryKey: string; amountCents: number }[];
  /** Simplification note surfaced to the caller so a future UI can show it next to the numbers. */
  simplificationNote: string;
}

const NK_PASSTHROUGH_SIMPLIFICATION_NOTE =
  "Vereinfachung: NK-Vorauszahlungen sind hier nicht als Einnahme enthalten (durchlaufender Posten). " +
  "NK-Nachzahlungen und -Guthaben aus Abrechnungen werden in dieser Version nicht automatisch verrechnet.";

/**
 * Linear AfA (Absetzung für Abnutzung) per §7(4) EStG: 2% p.a. for
 * buildings whose construction was completed from 1925 onward, 2.5% for
 * older buildings - the exact statutory threshold, not a rounded
 * approximation. Only the depreciable base (purchase price minus land
 * value, since land itself never depreciates) is subject to the rate.
 */
export function computeAfaCents(purchasePriceCents: number | null, landValueCents: number | null, buildingYear: number | null): { afaCents: number; ratePercent: number } {
  if (purchasePriceCents == null) return { afaCents: 0, ratePercent: 0 };
  const depreciableBase = purchasePriceCents - (landValueCents ?? 0);
  if (depreciableBase <= 0) return { afaCents: 0, ratePercent: 0 };
  const ratePercent = buildingYear != null && buildingYear >= 1925 ? 2 : 2.5;
  return { afaCents: Math.round((depreciableBase * ratePercent) / 100), ratePercent };
}

/**
 * Anlage-V prep numbers for one property + calendar year: actual Kaltmiete
 * received that year (from paid `vermieter_rent_payments`, prorated between
 * cold-rent and NK-due same as statements.ts's prepayment split) minus
 * `tax_deductible` receipts that year (independent of §2 BetrKV
 * apportionability - see db/costCategories.ts's doc comment: Verwaltungs-
 * kosten aren't chargeable to tenants but are still deductible here) minus
 * linear AfA. NK-Vorauszahlungen themselves are excluded as a pass-through,
 * per `NK_PASSTHROUGH_SIMPLIFICATION_NOTE` - see that constant.
 */
export function computeTaxOverview(sdk: ModuleSdk, workspaceId: string, propertyId: string, year: number): TaxOverviewDto {
  const property = requireProperty(sdk, workspaceId, propertyId);
  const units = listUnits(sdk, workspaceId, propertyId, true);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  let rentIncomeCents = 0;
  for (const unit of units) {
    const leases = listLeasesOverlappingPeriod(sdk, workspaceId, unit.id, yearStart, yearEnd);
    for (const lease of leases) {
      const payments = listRentPaymentsInPeriod(sdk, workspaceId, lease.id, yearStart, yearEnd);
      for (const payment of payments) {
        if (!payment.paid_amount_cents || payment.status === "open") continue;
        const dueTotal = payment.cold_rent_due_cents + payment.nk_prepayment_due_cents;
        const coldRentPortion = dueTotal > 0 ? Math.round((payment.paid_amount_cents * payment.cold_rent_due_cents) / dueTotal) : payment.paid_amount_cents;
        rentIncomeCents += coldRentPortion;
      }
    }
  }

  const receiptRows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_receipts WHERE workspace_id = ? AND property_id = ? AND receipt_date >= ? AND receipt_date <= ? AND tax_deductible = 1")
    .all(workspaceId, propertyId, yearStart, yearEnd) as VermieterReceiptRow[];

  const byCategory = new Map<string, number>();
  let deductibleExpensesCents = 0;
  for (const receipt of receiptRows) {
    deductibleExpensesCents += receipt.amount_cents;
    byCategory.set(receipt.cost_category_key, (byCategory.get(receipt.cost_category_key) ?? 0) + receipt.amount_cents);
  }

  const { afaCents, ratePercent } = computeAfaCents(property.purchase_price_cents, property.land_value_cents, property.building_year);

  return {
    propertyId,
    year,
    rentIncomeCents,
    deductibleExpensesCents,
    afaCents,
    afaRatePercent: ratePercent,
    netResultCents: rentIncomeCents - deductibleExpensesCents - afaCents,
    expensesByCategoryKey: [...byCategory.entries()].map(([costCategoryKey, amountCents]) => ({ costCategoryKey, amountCents })),
    simplificationNote: NK_PASSTHROUGH_SIMPLIFICATION_NOTE,
  };
}
