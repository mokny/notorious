/**
 * Decimal-safe money helpers for the Faktura module - amounts are always
 * stored/computed as integer minor units (cents), never floats, so
 * arithmetic (qty * unit price, discount/tax percentages, cross-line sums)
 * never accumulates float rounding error. German invoicing practice rounds
 * each line to the nearest cent once (kaufmännische Rundung), then sums the
 * already-rounded cents - never sum floats/fractional cents and round once
 * at the end.
 */

/** Rounds a possibly-fractional minor-unit amount to the nearest whole cent (half-away-from-zero). */
export function roundToCents(rawMinorUnits: number): number {
  return Math.sign(rawMinorUnits) * Math.round(Math.abs(rawMinorUnits));
}

/** `percent` in whole percent (e.g. 19 for 19%), applied to a cents amount and rounded to the nearest cent. */
export function percentOf(cents: number, percent: number): number {
  return roundToCents((cents * percent) / 100);
}

/** Formats integer cents as a German-locale amount, e.g. `123456` -> `"1.234,56 €"`. */
export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

/**
 * Parses a German-locale amount string (`"1.234,56"` or `"1234,56"` or
 * `"1234.56"`) into integer cents. Returns `null` if the input isn't a
 * parseable number. Strips currency symbols/whitespace first.
 */
export function parseCentsInput(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;

  // German format uses "." as thousands separator and "," as decimal
  // separator - if both appear, the comma is the decimal point; if only a
  // comma appears, treat it as the decimal point too (typical German entry).
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return roundToCents(value * 100);
}
