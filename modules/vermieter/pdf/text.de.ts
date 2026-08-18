/**
 * German document text for Vermieter PDFs - intentionally German regardless
 * of the app's usual English-UI convention, same exception manifest.ts's
 * doc comment explains for the whole module.
 */
import { ALLOCATION_KEY_LABEL_DE } from "../db/costCategories.js";
import type { VermieterAllocationKey } from "../db/types.js";

export { ALLOCATION_KEY_LABEL_DE };

export function allocationKeyLabel(key: VermieterAllocationKey): string {
  return ALLOCATION_KEY_LABEL_DE[key] ?? key;
}

export const ESTIMATED_VALUE_FOOTNOTE =
  "* Verbrauch geschätzt nach §9a HeizkostenV, da kein Zähler vorhanden.";

export const STATEMENT_CLOSING_TEXT =
  "Bei Fragen zu dieser Abrechnung wenden Sie sich bitte an die oben genannte Adresse. Etwaige Einwände " +
  "gegen diese Abrechnung sollten innerhalb angemessener Frist schriftlich mitgeteilt werden. Dieses Schreiben " +
  "stellt keine Rechtsberatung dar.";
