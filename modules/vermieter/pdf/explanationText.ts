import { formatCents } from "@notorious/shared";
import { getCostCategory } from "../db/costCategories.js";
import { ESTIMATION_METHOD_EXPLANATION_DE } from "./text.de.js";
import type { StatementLineDto, TenantSummaryDto } from "../services/statements.js";

/**
 * Generates the per-tenant "how was my amount derived" prose paragraph
 * (item 2 of this pass's brief) for one tenant-summary section of a
 * statement PDF. Every number here is read straight off the already-
 * computed `StatementLineDto`/`TenantSummaryDto` rows the table above it
 * renders from (see pdf/render.ts) - nothing is recomputed independently -
 * so the text is guaranteed to stay internally consistent with the table
 * even as the allocation math evolves, at the cost of only being able to
 * describe fractions the persisted rows actually carry (unit-share ÷
 * total-property-cost, and days-occupied ÷ days-total; see
 * services/statementCalculation.ts's StatementLineResult - there is no
 * separately persisted "your sqm ÷ circuit sqm" figure, so that fraction is
 * expressed as the combined weight-day share percentage instead, which is
 * the mathematically equivalent number the table itself shows).
 */

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

function pct(shareCents: number, totalCents: number): string {
  return totalCents > 0 ? `${((shareCents / totalCents) * 100).toFixed(2).replace(".", ",")} %` : "0 %";
}

function categoryLabel(key: string): string {
  return getCostCategory(key)?.label ?? key;
}

function sentenceForAllocationLine(line: StatementLineDto): string {
  const categoryTotal = formatCents(line.totalPropertyCostCents);
  const share = pct(line.unitShareCents, line.totalPropertyCostCents);
  const amount = formatCents(line.unitShareCents);
  const days = `${line.daysOccupied} von ${line.daysTotal} Tagen`;

  if (line.allocationKeyUsed === "sqm") {
    return `${categoryLabel(line.costCategoryKey)} (Gesamtkosten: ${categoryTotal}) wurde nach Wohnfläche verteilt. Bezogen auf Ihren Belegungszeitraum (${days} im Abrechnungszeitraum) entfällt auf Ihre Einheit ein Anteil von ${share}, das entspricht ${amount}.`;
  }
  if (line.allocationKeyUsed === "persons") {
    return `${categoryLabel(line.costCategoryKey)} (Gesamtkosten: ${categoryTotal}) wurde nach Personenzahl verteilt. Bezogen auf Ihren Belegungszeitraum (${days} im Abrechnungszeitraum) entfällt auf Ihren Haushalt ein Anteil von ${share}, das entspricht ${amount}.`;
  }
  if (line.allocationKeyUsed === "units") {
    return `${categoryLabel(line.costCategoryKey)} (Gesamtkosten: ${categoryTotal}) wurde nach Anzahl der Einheiten (Kopfteil) verteilt. Bezogen auf Ihren Belegungszeitraum (${days} im Abrechnungszeitraum) entfällt auf Ihre Einheit ein Anteil von ${share}, das entspricht ${amount}.`;
  }
  if (line.allocationKeyUsed === "fixed_manual") {
    return `${categoryLabel(line.costCategoryKey)} (${amount}) wurde Ihnen als Einzelbeleg direkt zugeordnet, unabhängig von einem allgemeinen Verteilerschlüssel.`;
  }
  // consumption
  const estimationClause = line.isEstimated && line.estimationMethod
    ? ` Der zugrunde gelegte Verbrauchswert wurde ${ESTIMATION_METHOD_EXPLANATION_DE[line.estimationMethod]}.`
    : " Grundlage ist Ihr tatsächlich gemessener Verbrauch.";
  return `${categoryLabel(line.costCategoryKey)} (Gesamtkosten: ${categoryTotal}) wurde nach Verbrauch verteilt. Ihr Anteil beträgt ${share}, das entspricht ${amount}.${estimationClause}`;
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
    `beträgt ${grundShare}, das entspricht ${grundAmount}. Der Verbrauchskosten-Anteil (Gesamtkosten: ${verbrauchTotal}) wird nach Verbrauch ` +
    `verteilt: Ihr Anteil beträgt ${verbrauchShare}, das entspricht ${verbrauchAmount}.${estimationClause} In Summe ergibt sich für Heizung ` +
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
export function generateTenantExplanationParagraph(unitLines: StatementLineDto[], summary: TenantSummaryDto): string {
  const chargedLines = unitLines.filter((line) => line.unitShareCents !== 0 || line.totalPropertyCostCents !== 0);
  const heatingLines = chargedLines.filter((line) => line.costCategoryKey === "heizung");
  const otherLines = chargedLines.filter((line) => line.costCategoryKey !== "heizung");

  const sentences: string[] = [];
  const heatingSqm = heatingLines.find((l) => l.allocationKeyUsed === "sqm");
  const heatingConsumption = heatingLines.find((l) => l.allocationKeyUsed === "consumption");
  if (heatingSqm && heatingConsumption) {
    sentences.push(sentenceForHeatingLines(heatingSqm, heatingConsumption));
  } else {
    for (const line of heatingLines) sentences.push(sentenceForAllocationLine(line));
  }
  for (const line of otherLines) sentences.push(sentenceForAllocationLine(line));

  const totalAllocated = formatCents(summary.totalAllocatedCostCents);
  const prepayments = formatCents(summary.totalPrepaymentsCents);
  const balanceLabel = summary.balanceCents >= 0 ? "Nachzahlung" : "Guthaben";
  const balanceAmount = formatCents(Math.abs(summary.balanceCents));
  sentences.push(
    `Ihre Gesamtkosten für den Zeitraum vom ${formatDate(summary.segmentStart)} bis ${formatDate(summary.segmentEnd)} betragen ${totalAllocated}. ` +
      `Abzüglich Ihrer in diesem Zeitraum geleisteten Vorauszahlungen von ${prepayments} ergibt sich eine ${balanceLabel} in Höhe von ${balanceAmount}.`,
  );

  return sentences.join(" ");
}
