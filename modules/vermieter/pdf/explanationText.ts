import { formatCents } from "@notorious/shared";
import { ESTIMATION_METHOD_EXPLANATION_DE } from "./text.de.js";
import type { StatementLineDto, TenantSummaryDto } from "../services/statements.js";

/**
 * Generates the per-tenant "how was my amount derived" prose paragraph
 * (item 2 of this pass's brief) for one tenant-summary section of a
 * statement PDF. Every number here is read straight off the already-
 * computed `StatementLineDto`/`TenantSummaryDto` rows the table above it
 * renders from (see pdf/render.ts) - nothing is recomputed independently -
 * so the text is guaranteed to stay internally consistent with the table
 * even as the allocation math evolves.
 *
 * Every percentage/fraction mentioned is immediately followed by the raw
 * numbers that produced it: the days-occupied ÷ days-total fraction (always
 * available), and - for sqm/persons/units/consumption lines - the
 * allocation-basis numerator/denominator persisted on the line
 * (`basisNumerator`/`basisDenominator`, e.g. "your unit's 62.5 m² of the
 * circuit's 310 m² total" - see services/statementCalculation.ts's
 * `basisSentence` counterpart and migrations/0013). `fixed_manual` lines
 * have no allocation-key fraction to begin with (their whole point is
 * bypassing one), and `external_provider` lines are an authoritative
 * transcribed figure, not a derived percentage - both get their own
 * fraction-free prose instead (see sentenceForAllocationLine below).
 */

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function pct(shareCents: number, totalCents: number): string {
  return totalCents > 0 ? `${((shareCents / totalCents) * 100).toFixed(2).replace(".", ",")} %` : "0 %";
}

function categoryLabel(categoryLabels: Record<string, string>, key: string): string {
  return categoryLabels[key] ?? key;
}

/** German-locale number formatting ("62,50"), matching pct()'s comma-decimal convention. */
function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals).replace(".", ",");
}

/**
 * The "why this percentage" sentence: shows the raw allocation-basis
 * numerator/denominator (see StatementLineDto.basisNumerator/
 * basisDenominator) alongside the division that produces the percentage, in
 * the style of the module brief's own example ("Ihre Einheit hat 62,5 m²
 * Wohnfläche von insgesamt 310 m² im Abrechnungskreis (62,5 ÷ 310 = 20,16
 * %)."). Returns "" when the line has no persisted basis figures (older
 * pre-migration statements, or an allocation key this doesn't apply to) so
 * callers can simply append it without a conditional.
 */
function basisSentence(kind: "sqm" | "persons" | "units" | "consumption", numerator: number | null, denominator: number | null): string {
  if (numerator === null || denominator === null || denominator <= 0) return "";
  const decimals = kind === "sqm" || kind === "consumption" ? 2 : 0;
  const num = formatNumber(numerator, decimals);
  const den = formatNumber(denominator, decimals);
  const ratioPct = `${((numerator / denominator) * 100).toFixed(2).replace(".", ",")} %`;
  if (kind === "sqm") {
    return ` Ihre Einheit hat ${num} m² Wohnfläche von insgesamt ${den} m² im Abrechnungskreis (${num} ÷ ${den} = ${ratioPct}).`;
  }
  if (kind === "persons") {
    return ` Ihr Haushalt umfasst ${num} Personen von insgesamt ${den} Personen im Abrechnungskreis (${num} ÷ ${den} = ${ratioPct}).`;
  }
  if (kind === "units") {
    return ` Ihre Einheit zählt als 1 von ${den} Einheiten im Abrechnungskreis (1 ÷ ${den} = ${ratioPct}).`;
  }
  return ` Ihr ermittelter Verbrauch beträgt ${num} von insgesamt ${den} Verbrauchseinheiten im Abrechnungskreis (${num} ÷ ${den} = ${ratioPct}).`;
}

function sentenceForAllocationLine(line: StatementLineDto, categoryLabels: Record<string, string>): string {
  const categoryTotal = formatCents(line.totalPropertyCostCents);
  const share = pct(line.unitShareCents, line.totalPropertyCostCents);
  const amount = formatCents(line.unitShareCents);
  const days = `${line.daysOccupied} von ${line.daysTotal} Tagen`;
  const label = categoryLabel(categoryLabels, line.costCategoryKey);

  if (line.allocationKeyUsed === "sqm") {
    return (
      `${label} (Gesamtkosten: ${categoryTotal}) wurde nach Wohnfläche verteilt. Bezogen auf Ihren Belegungszeitraum ` +
      `(${days} im Abrechnungszeitraum) entfällt auf Ihre Einheit ein Anteil von ${share}, das entspricht ${amount}.` +
      basisSentence("sqm", line.basisNumerator, line.basisDenominator)
    );
  }
  if (line.allocationKeyUsed === "persons") {
    return (
      `${label} (Gesamtkosten: ${categoryTotal}) wurde nach Personenzahl verteilt. Bezogen auf Ihren Belegungszeitraum ` +
      `(${days} im Abrechnungszeitraum) entfällt auf Ihren Haushalt ein Anteil von ${share}, das entspricht ${amount}.` +
      basisSentence("persons", line.basisNumerator, line.basisDenominator)
    );
  }
  if (line.allocationKeyUsed === "units") {
    return (
      `${label} (Gesamtkosten: ${categoryTotal}) wurde nach Anzahl der Einheiten (Kopfteil) verteilt. Bezogen auf Ihren ` +
      `Belegungszeitraum (${days} im Abrechnungszeitraum) entfällt auf Ihre Einheit ein Anteil von ${share}, das entspricht ${amount}.` +
      basisSentence("units", line.basisNumerator, line.basisDenominator)
    );
  }
  if (line.allocationKeyUsed === "fixed_manual") {
    return `${label} (${amount}) wurde Ihnen als Einzelbeleg direkt zugeordnet, unabhängig von einem allgemeinen Verteilerschlüssel.`;
  }
  if (line.allocationKeyUsed === "external_provider") {
    const provider = line.externalProviderName ?? "einem externen Abrechnungsdienstleister";
    return `Die Kosten für ${label} (${amount}) wurden von ${provider} extern abgerechnet und direkt für Ihre Einheit übernommen.`;
  }
  // consumption
  const estimationClause = line.isEstimated && line.estimationMethod
    ? ` Der zugrunde gelegte Verbrauchswert wurde ${ESTIMATION_METHOD_EXPLANATION_DE[line.estimationMethod]}.`
    : " Grundlage ist Ihr tatsächlich gemessener Verbrauch.";
  return (
    `${label} (Gesamtkosten: ${categoryTotal}) wurde nach Verbrauch verteilt. Ihr Anteil beträgt ${share}, das entspricht ${amount}.` +
    basisSentence("consumption", line.basisNumerator, line.basisDenominator) +
    estimationClause
  );
}

/**
 * Heizung is split into two persisted lines (Grundkosten by sqm,
 * Verbrauchskosten by consumption - HeizkostenV §7's 70/30 split, see
 * services/statementCalculation.ts::computeHeatingLines) that share one
 * `costCategoryKey` ("heizung"). Explained as one combined paragraph
 * mentioning both sub-portions and their sum, rather than as two generic
 * category sentences, so the 70/30 split itself is legible to the tenant.
 */
function sentenceForHeatingLines(sqmLine: StatementLineDto, consumptionLine: StatementLineDto): string {
  const grundTotal = formatCents(sqmLine.totalPropertyCostCents);
  const grundShare = pct(sqmLine.unitShareCents, sqmLine.totalPropertyCostCents);
  const grundAmount = formatCents(sqmLine.unitShareCents);

  const verbrauchTotal = formatCents(consumptionLine.totalPropertyCostCents);
  const verbrauchShare = pct(consumptionLine.unitShareCents, consumptionLine.totalPropertyCostCents);
  const verbrauchAmount = formatCents(consumptionLine.unitShareCents);
  const estimationClause = consumptionLine.isEstimated && consumptionLine.estimationMethod
    ? ` Der zugrunde gelegte Heizverbrauch wurde ${ESTIMATION_METHOD_EXPLANATION_DE[consumptionLine.estimationMethod]}.`
    : " Grundlage ist Ihr tatsächlich gemessener Heizverbrauch.";

  const sumAmount = formatCents(sqmLine.unitShareCents + consumptionLine.unitShareCents);

  return (
    `Heizkosten wurden gemäß §7 HeizkostenV in einen verbrauchsunabhängigen Grundkosten-Anteil und einen verbrauchsabhängigen ` +
    `Verbrauchskosten-Anteil aufgeteilt. Der Grundkosten-Anteil (Gesamtkosten: ${grundTotal}) wird nach Wohnfläche verteilt: Ihr Anteil ` +
    `beträgt ${grundShare}, das entspricht ${grundAmount}.` +
    basisSentence("sqm", sqmLine.basisNumerator, sqmLine.basisDenominator) +
    ` Der Verbrauchskosten-Anteil (Gesamtkosten: ${verbrauchTotal}) wird nach Verbrauch ` +
    `verteilt: Ihr Anteil beträgt ${verbrauchShare}, das entspricht ${verbrauchAmount}.` +
    basisSentence("consumption", consumptionLine.basisNumerator, consumptionLine.basisDenominator) +
    `${estimationClause} In Summe ergibt sich für Heizung ` +
    `ein Betrag von ${sumAmount}.`
  );
}

/**
 * Full paragraph for one tenant-summary section: one sentence/paragraph per
 * cost line that tenant was actually charged (vacancy-borne shares are
 * landlord-only and never appear in `unitLines`/this tenant's charge to
 * begin with - see statementCalculation.ts's vacancy-bucket doc comment),
 * ending with the prepayments-vs-cost reconciliation sentence.
 */
export function generateTenantExplanationParagraph(
  unitLines: StatementLineDto[],
  summary: TenantSummaryDto,
  categoryLabels: Record<string, string> = {},
): string {
  const chargedLines = unitLines.filter((line) => line.unitShareCents !== 0 || line.totalPropertyCostCents !== 0);
  const heatingLines = chargedLines.filter((line) => line.costCategoryKey === "heizung");
  const otherLines = chargedLines.filter((line) => line.costCategoryKey !== "heizung");

  const sentences: string[] = [];
  const heatingSqm = heatingLines.find((l) => l.allocationKeyUsed === "sqm");
  const heatingConsumption = heatingLines.find((l) => l.allocationKeyUsed === "consumption");
  if (heatingSqm && heatingConsumption) {
    sentences.push(sentenceForHeatingLines(heatingSqm, heatingConsumption));
  } else {
    for (const line of heatingLines) sentences.push(sentenceForAllocationLine(line, categoryLabels));
  }
  for (const line of otherLines) sentences.push(sentenceForAllocationLine(line, categoryLabels));

  const totalAllocated = formatCents(summary.totalAllocatedCostCents);
  const prepayments = formatCents(summary.totalPrepaymentsCents);
  const isNachzahlung = summary.balanceCents >= 0;
  const balanceLabel = isNachzahlung ? "Nachzahlung" : "Guthaben";
  const balanceArticle = isNachzahlung ? "eine" : "ein";
  const balanceAmount = formatCents(Math.abs(summary.balanceCents));
  sentences.push(
    `Ihre Gesamtkosten für den Zeitraum vom ${formatDate(summary.segmentStart)} bis ${formatDate(summary.segmentEnd)} betragen ${totalAllocated}. ` +
      `Abzüglich Ihrer in diesem Zeitraum geleisteten Vorauszahlungen von ${prepayments} ergibt sich ${balanceArticle} ${balanceLabel} in Höhe von ${balanceAmount}.`,
  );

  return sentences.join(" ");
}
