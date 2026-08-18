import type { VermieterAllocationKey } from "./types.js";

export interface VermieterCostCategory {
  key: string;
  /** German label - see manifest.ts's doc comment on why this whole module is German-only. */
  label: string;
  defaultAllocationKey: VermieterAllocationKey;
  /** Umlagefähig nach §2 BetrKV - whether this cost category may be passed on to tenants in a Nebenkostenabrechnung at all. */
  apportionable: boolean;
  /** Default for a new receipt's `tax_deductible` flag (landlord-side income-tax deductibility, independent of `apportionable` - see services/taxOverview.ts). */
  taxDeductibleDefault: boolean;
}

/**
 * Fixed cost-category list (NOT a DB table) - both the statement-calculation
 * engine and the PDF renderer key off this. `apportionable` follows §2
 * BetrKV (Betriebskostenverordnung): Verwaltungskosten and Instandhaltung/
 * Reparatur are classic non-umlagefähige costs a landlord must bear itself
 * and must never appear as a tenant charge in a Nebenkostenabrechnung, even
 * though they're still deductible against the landlord's own rental income
 * (see taxOverview.ts, which uses `taxDeductibleDefault` instead).
 */
export const VERMIETER_COST_CATEGORIES: VermieterCostCategory[] = [
  { key: "grundsteuer", label: "Grundsteuer", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  { key: "wasser_abwasser", label: "Wasser/Abwasser", defaultAllocationKey: "consumption", apportionable: true, taxDeductibleDefault: true },
  { key: "heizung", label: "Heizung (Brennstoffkosten)", defaultAllocationKey: "consumption", apportionable: true, taxDeductibleDefault: true },
  { key: "heizungswartung", label: "Heizungswartung", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  { key: "muellabfuhr", label: "Müllabfuhr", defaultAllocationKey: "persons", apportionable: true, taxDeductibleDefault: true },
  { key: "hausreinigung", label: "Hausreinigung", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  { key: "gartenpflege", label: "Gartenpflege", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  { key: "hausmeister", label: "Hausmeister", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  { key: "schornsteinfeger", label: "Schornsteinfeger", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  { key: "aufzug", label: "Aufzug", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  {
    key: "gebaeudeversicherung",
    label: "Gebäudeversicherung/Haftpflicht",
    defaultAllocationKey: "sqm",
    apportionable: true,
    taxDeductibleDefault: true,
  },
  { key: "allgemeinstrom", label: "Allgemeinstrom", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
  {
    key: "verwaltungskosten",
    label: "Verwaltungskosten",
    defaultAllocationKey: "units",
    apportionable: false,
    taxDeductibleDefault: true,
  },
  {
    key: "instandhaltung",
    label: "Instandhaltung/Reparatur",
    defaultAllocationKey: "units",
    apportionable: false,
    taxDeductibleDefault: true,
  },
  { key: "sonstiges", label: "Sonstiges", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
];

export function getCostCategory(key: string): VermieterCostCategory | undefined {
  return VERMIETER_COST_CATEGORIES.find((category) => category.key === key);
}

export const ALLOCATION_KEY_LABEL_DE: Record<VermieterAllocationKey, string> = {
  sqm: "nach Wohnfläche",
  persons: "nach Personenzahl",
  units: "nach Anzahl Einheiten",
  consumption: "nach Verbrauch",
  fixed_manual: "individuell",
};
