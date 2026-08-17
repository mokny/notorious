/**
 * German legal/document text for Faktura PDFs - intentionally German
 * regardless of the app's usual English-UI convention (see manifest.ts's
 * doc comment: this whole module is German, both UI and document content).
 */

export const documentTypeLabel = {
  quote: "Angebot",
  order: "Auftragsbestätigung",
  invoice: "Rechnung",
  credit_note: "Gutschrift",
} as const;

export const unitLabelDe: Record<string, string> = {
  piece: "Stk.",
  hour: "Std.",
  day: "Tag",
  flat: "pausch.",
  kg: "kg",
  custom: "",
};

export function taxRateLabel(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(0)}%`;
}
