/**
 * German document text for Vermieter PDFs - intentionally German regardless
 * of the app's usual English-UI convention, same exception manifest.ts's
 * doc comment explains for the whole module.
 */
import { ALLOCATION_KEY_LABEL_DE } from "../db/costCategories.js";
import type { VermieterAllocationKey, VermieterEstimationMethod } from "../db/types.js";

export { ALLOCATION_KEY_LABEL_DE };

/** `providerName` (only meaningful for `key === 'external_provider'`) produces a provider-specific label ("Extern (Techem)") instead of the generic ALLOCATION_KEY_LABEL_DE fallback - see migrations/0012's doc comment. */
export function allocationKeyLabel(key: VermieterAllocationKey, providerName?: string | null): string {
  if (key === "external_provider" && providerName) return `Extern (${providerName})`;
  return ALLOCATION_KEY_LABEL_DE[key] ?? key;
}

/** Full-sentence German explanation of why a line's value is a §9a HeizkostenV substitute - used by pdf/explanationText.ts, expands on ESTIMATED_VALUE_FOOTNOTE's short marker with the specific method. */
export const ESTIMATION_METHOD_EXPLANATION_DE: Record<VermieterEstimationMethod, string> = {
  metered: "auf Basis Ihres tatsächlichen Zählerstands",
  substitute_own_history:
    "als Ersatzwert nach §9a HeizkostenV auf Basis Ihres eigenen Verbrauchs aus einer vergleichbaren vorherigen Abrechnungsperiode geschätzt, da für den aktuellen Zeitraum keine verwertbaren Zählerstände vorlagen",
  substitute_comparable_units:
    "als Ersatzwert nach §9a HeizkostenV anhand des Durchschnittsverbrauchs je Quadratmeter vergleichbarer Einheiten mit Zählerdaten geschätzt, da weder für den aktuellen noch für einen vorherigen Zeitraum eigene Zählerstände vorlagen",
  substitute_sqm_fallback:
    "hilfsweise nach Wohnfläche geschätzt, da für keine Einheit im Abrechnungskreis verwertbare Zählerstände vorlagen",
};

export const ESTIMATED_VALUE_FOOTNOTE =
  "* Verbrauch geschätzt nach §9a HeizkostenV, da kein Zähler vorhanden.";

export const STATEMENT_CLOSING_TEXT =
  "Bei Fragen zu dieser Abrechnung wenden Sie sich bitte an die oben genannte Adresse. Etwaige Einwände " +
  "gegen diese Abrechnung sollten innerhalb angemessener Frist schriftlich mitgeteilt werden. Dieses Schreiben " +
  "stellt keine Rechtsberatung dar.";
