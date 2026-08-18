import PDFDocument from "pdfkit";
import { formatCents } from "@notorious/shared";
import { getCostCategory } from "../db/costCategories.js";
import { allocationKeyLabel, STATEMENT_CLOSING_TEXT, ESTIMATED_VALUE_FOOTNOTE } from "./text.de.js";
import { generateTenantExplanationParagraph } from "./explanationText.js";
import type { StatementDto, StatementLineDto, TenantSummaryDto } from "../services/statements.js";
import type { PropertyDto } from "../services/properties.js";
import type { LandlordProfileDto } from "../services/landlordProfile.js";

const PAGE_MARGIN = 50;

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

export interface TenantSummaryForPdf extends TenantSummaryDto {
  unitLabel: string;
  tenantNames: string[];
}

/**
 * Renders one PDF for a whole statement, containing one page-section per
 * tenant-summary (one per lease-segment covering the period - a
 * mid-period Mieterwechsel gets two sections for the same unit). A single
 * combined PDF was chosen over one-file-per-tenant purely for simplicity
 * of caching/storage (one `pdf_storage_path` on the statement row, same
 * shape as faktura's per-document PDF caching) - a future UI can still
 * offer "download this tenant's pages" by splitting client-side or adding
 * a page-range query param later if needed.
 */
export function renderStatementPdf(
  property: PropertyDto,
  landlord: LandlordProfileDto,
  statement: StatementDto,
  lines: StatementLineDto[],
  tenantSummaries: TenantSummaryForPdf[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const propertyAddress = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;

    tenantSummaries.forEach((summary, index) => {
      if (index > 0) doc.addPage();
      renderTenantSection(doc, property, propertyAddress, landlord, statement, lines, summary);
    });

    if (tenantSummaries.length === 0) {
      doc.fontSize(11).text("Keine Mieterabschnitte für diesen Abrechnungszeitraum.", PAGE_MARGIN, PAGE_MARGIN);
    }

    doc.end();
  });
}

function renderTenantSection(
  doc: PDFKit.PDFDocument,
  property: PropertyDto,
  propertyAddress: string,
  landlord: LandlordProfileDto,
  statement: StatementDto,
  allLines: StatementLineDto[],
  summary: TenantSummaryForPdf,
): void {
  doc.fontSize(8).fillColor("#666666").text(
    [landlord.name, landlord.street, `${landlord.postalCode} ${landlord.city}`].filter(Boolean).join(" · "),
    PAGE_MARGIN,
    PAGE_MARGIN,
  );

  const addressTop = PAGE_MARGIN + 30;
  doc.fontSize(10).fillColor("#000000");
  doc.text(summary.tenantNames.join(", ") || "Mieter", PAGE_MARGIN, addressTop);
  doc.text(propertyAddress, PAGE_MARGIN, addressTop + 14);
  doc.text(`Einheit: ${summary.unitLabel}`, PAGE_MARGIN, addressTop + 28);

  const titleY = addressTop + 70;
  // Deliberately the tenant's own occupied span (summary.segmentStart/
  // segmentEnd - a lease segment clipped to the statement period, see
  // services/statementCalculation.ts's CalcLeaseSegment), NOT the
  // statement's overall period: a lease that started or ended mid-period
  // must never see the full statement period quoted here, since the table
  // below only ever charges them for their own occupied days.
  doc
    .fontSize(15)
    .text(
      `Nebenkostenabrechnung für den Zeitraum ${formatDate(summary.segmentStart)} – ${formatDate(summary.segmentEnd)}`,
      PAGE_MARGIN,
      titleY,
      { width: 495 },
    );

  let tableY = titleY + 40;
  const colCategory = { x: PAGE_MARGIN, width: 150 };
  const colTotal = { x: PAGE_MARGIN + 150, width: 90 };
  const colKey = { x: PAGE_MARGIN + 240, width: 110 };
  const colShareLabel = { x: PAGE_MARGIN + 350, width: 60 };
  const colAmount = { x: PAGE_MARGIN + 410, width: 85 };

  doc.fontSize(9).fillColor("#000000");
  doc.moveTo(PAGE_MARGIN, tableY - 4).lineTo(PAGE_MARGIN + 495, tableY - 4).strokeColor("#cccccc").stroke();
  doc.text("Kostenart", colCategory.x, tableY, { width: colCategory.width });
  doc.text("Gesamtkosten Objekt", colTotal.x, tableY, { width: colTotal.width, align: "right" });
  doc.text("Verteilerschlüssel", colKey.x, tableY, { width: colKey.width });
  doc.text("Ihr Anteil", colShareLabel.x, tableY, { width: colShareLabel.width, align: "right" });
  doc.text("Betrag", colAmount.x, tableY, { width: colAmount.width, align: "right" });
  tableY += 16;
  doc.moveTo(PAGE_MARGIN, tableY - 4).lineTo(PAGE_MARGIN + 495, tableY - 4).strokeColor("#cccccc").stroke();

  const unitLines = allLines.filter((line) => line.unitId === summary.unitId);
  let subtotalCents = 0;
  let hasEstimatedLine = false;
  for (const line of unitLines) {
    if (line.unitShareCents === 0 && line.totalPropertyCostCents === 0) continue;
    if (tableY > 720) {
      doc.addPage();
      tableY = PAGE_MARGIN;
    }
    const categoryLabel = getCostCategory(line.costCategoryKey)?.label ?? line.costCategoryKey;
    const sharePercent = line.totalPropertyCostCents > 0 ? `${((line.unitShareCents / line.totalPropertyCostCents) * 100).toFixed(1)}%` : "-";
    doc.text(categoryLabel, colCategory.x, tableY, { width: colCategory.width });
    doc.text(formatCents(line.totalPropertyCostCents), colTotal.x, tableY, { width: colTotal.width, align: "right" });
    doc.text(allocationKeyLabel(line.allocationKeyUsed), colKey.x, tableY, { width: colKey.width });
    doc.text(sharePercent, colShareLabel.x, tableY, { width: colShareLabel.width, align: "right" });
    // Estimated (§9a HeizkostenV substitute) lines get a trailing "*"
    // marker so a substitute value never looks identical to a real metered
    // one in the output - see ESTIMATED_VALUE_FOOTNOTE below.
    const amountText = line.isEstimated ? `${formatCents(line.unitShareCents)} *` : formatCents(line.unitShareCents);
    if (line.isEstimated) hasEstimatedLine = true;
    doc.text(amountText, colAmount.x, tableY, { width: colAmount.width, align: "right" });
    tableY += 16;
    subtotalCents += line.unitShareCents;
  }

  tableY += 8;
  doc.moveTo(PAGE_MARGIN + 330, tableY).lineTo(PAGE_MARGIN + 495, tableY).strokeColor("#cccccc").stroke();
  tableY += 8;

  doc.fontSize(10).text("Summe Kosten:", PAGE_MARGIN + 330, tableY, { width: 80, align: "right" });
  doc.text(formatCents(subtotalCents), colAmount.x, tableY, { width: colAmount.width, align: "right" });
  tableY += 16;

  doc.text("Vorauszahlungen geleistet:", PAGE_MARGIN + 260, tableY, { width: 150, align: "right" });
  doc.text(`- ${formatCents(summary.totalPrepaymentsCents)}`, colAmount.x, tableY, { width: colAmount.width, align: "right" });
  tableY += 20;

  doc.moveTo(PAGE_MARGIN + 260, tableY - 4).lineTo(PAGE_MARGIN + 495, tableY - 4).strokeColor("#000000").stroke();

  const balanceLabel = summary.balanceCents >= 0 ? "Nachzahlung:" : "Guthaben:";
  doc
    .fontSize(12)
    .fillColor(summary.balanceCents >= 0 ? "#b91c1c" : "#15803d")
    .text(balanceLabel, PAGE_MARGIN + 260, tableY, { width: 150, align: "right" });
  doc.text(formatCents(Math.abs(summary.balanceCents)), colAmount.x, tableY, { width: colAmount.width, align: "right" });
  tableY += 30;

  if (hasEstimatedLine) {
    doc.fontSize(8).fillColor("#666666").text(ESTIMATED_VALUE_FOOTNOTE, PAGE_MARGIN, tableY, { width: 495 });
    tableY += 14;
  }

  tableY += 10;
  if (tableY > 680) {
    doc.addPage();
    tableY = PAGE_MARGIN;
  }
  doc.fontSize(10).fillColor("#000000").text("Erläuterung Ihrer Kostenanteile", PAGE_MARGIN, tableY, { width: 495 });
  tableY = doc.y + 6;

  // Detailed per-line prose explanation (item 2 of this pass's brief) - lets
  // pdfkit wrap naturally (justify, fixed width) rather than the table's
  // manual column layout, since this is running text, not tabular data.
  // Uses doc.y (pdfkit tracks the cursor after each `text()` call) to decide
  // page breaks, since a long explanation's final height isn't known ahead
  // of time.
  const explanation = generateTenantExplanationParagraph(unitLines, summary);
  doc.fontSize(9).fillColor("#222222");
  doc.y = tableY;
  if (doc.y > 700) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
  doc.text(explanation, PAGE_MARGIN, doc.y, { width: 495, align: "justify" });
  tableY = doc.y + 20;

  if (tableY > 700) {
    doc.addPage();
    tableY = PAGE_MARGIN;
  }
  doc.fontSize(8).fillColor("#333333").text(STATEMENT_CLOSING_TEXT, PAGE_MARGIN, tableY, { width: 495 });
}
