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

export const dunningLevelTitle: Record<1 | 2 | 3, string> = {
  1: "Zahlungserinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung",
};

export const dunningLevelBodyText: Record<1 | 2 | 3, string> = {
  1: "sicher haben Sie es nur übersehen: Die unten genannte Rechnung ist noch offen. Wir bitten Sie, den fälligen Betrag in den nächsten Tagen zu begleichen. Sollten Sie bereits gezahlt haben, betrachten Sie dieses Schreiben als gegenstandslos.",
  2: "trotz Fälligkeit konnten wir bislang keinen Zahlungseingang zu der unten genannten Rechnung feststellen. Wir bitten Sie, den offenen Betrag inkl. Mahngebühr und Verzugszinsen umgehend zu begleichen.",
  3: "leider ist auch nach unserer letzten Mahnung kein Zahlungseingang zu verzeichnen. Wir fordern Sie letztmalig auf, den gesamten offenen Betrag inkl. Mahngebühr und Verzugszinsen unverzüglich zu begleichen.",
};

