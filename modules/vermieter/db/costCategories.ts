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
  /**
   * Split from the former combined "wasser_abwasser" key into two separate
   * built-ins (Wasser, Abwasser) - both keep the exact same metadata the
   * combined entry had. This is purely a cost-CATEGORY split; it doesn't
   * touch meter-kind grouping at all - meters have their own independent
   * `type` field ('heating'|'cold_water'|'hot_water'|'electricity'|'other',
   * see db/types.ts::VermieterMeterType), and the §9a HeizkostenV
   * consumption-resolution machinery (services/meterSubstitute.ts,
   * statementCalculation.ts::computeConsumptionLines) groups cold+hot water
   * meter readings into one consumption figure per unit regardless of which
   * cost category('ies) that figure ends up allocating - it was never keyed
   * off "wasser_abwasser" specifically. Both new categories default to
   * 'consumption' just like the combined one did, so both keep working with
   * that same machinery unchanged.
   */
  { key: "wasser", label: "Wasser", defaultAllocationKey: "consumption", apportionable: true, taxDeductibleDefault: true },
  { key: "abwasser", label: "Abwasser", defaultAllocationKey: "consumption", apportionable: true, taxDeductibleDefault: true },
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
  /**
   * Betriebsstrom der Heizungsanlage (pumps/controls, not fuel) - explicitly
   * umlagefähig under §2 Nr. 4 BetrKV, distinct from "heizung" (fuel/
   * Brennstoffkosten) and "allgemeinstrom" (general building electricity).
   * defaultAllocationKey deliberately 'sqm', not 'units' or 'consumption':
   * submetering a shared heating system's own electricity use per unit isn't
   * typical practice, so there's no natural consumption basis - and this is
   * the same kind of "general building system electricity" cost as
   * allgemeinstrom, which already defaults to 'sqm', so mirroring that
   * precedent keeps the two electricity categories consistent.
   */
  { key: "strom_heizungsanlage", label: "Strom Heizungsanlage", defaultAllocationKey: "sqm", apportionable: true, taxDeductibleDefault: true },
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
  /** Generic fallback - pdf/text.de.ts::allocationKeyLabel() prefers a provider-specific label ("Extern (Techem)") when a provider name is available. */
  external_provider: "extern abgerechnet",
};
