import PDFDocument from "pdfkit";
import { formatCents } from "@notorious/shared";
import { allocationKeyLabel, STATEMENT_CLOSING_TEXT, ESTIMATED_VALUE_FOOTNOTE, VACANCY_PAGE_TITLE, VACANCY_PAGE_INTRO_TEXT } from "./text.de.js";
import { generateTenantExplanationParagraph } from "./explanationText.js";
import { proratedLinesForSegment } from "../services/statementCalculation.js";
import type { StatementDto, StatementLineDto, TenantSummaryDto, UnitVacancySummaryDto } from "../services/statements.js";
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
  vacancySummaries: UnitVacancySummaryDto[] = [],
  /**
   * `costCategoryKey -> label` lookup covering both built-in and this
   * workspace's custom categories (see services/customCostCategories.ts::
   * buildCostCategoryLabelMap) - resolved once by the caller (routes/
   * statementPdf.ts) rather than making this otherwise-pure renderer
   * workspace/DB-aware. Falls back to the raw key for any miss.
   */
  categoryLabels: Record<string, string> = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // `bufferPages: true` is required to go back and stamp a per-section
    // page number ("Seite X von Y") onto already-written pages via
    // `doc.switchToPage()` after each tenant's section is fully rendered -
    // without it pdfkit flushes pages to the output stream immediately and
    // they can no longer be revisited.
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const propertyAddress = `${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`;

    // Page numbering is scoped PER TENANT SECTION ("Seite 1 von 2", restarting
    // at 1 for the next tenant), not a single running count across the whole
    // combined PDF - each tenant only ever sees their own document's pages.
    const sectionPageRanges: { start: number; end: number }[] = [];
    tenantSummaries.forEach((summary, index) => {
      if (index > 0) doc.addPage();
      const start = doc.bufferedPageRange().count - 1;
      renderTenantSection(doc, property, propertyAddress, landlord, statement, lines, summary, tenantSummaries, categoryLabels);
      const end = doc.bufferedPageRange().count - 1;
      sectionPageRanges.push({ start, end });
    });

    if (tenantSummaries.length === 0) {
      doc.fontSize(11).text("Keine Mieterabschnitte für diesen Abrechnungszeitraum.", PAGE_MARGIN, PAGE_MARGIN);
    }

    // One additional page at the end summarizing landlord-borne vacancy
    // across the whole statement (all units/circuits, all categories) -
    // skipped entirely when no unit had any vacancy in this period, see
    // services/statements.ts::getStatementVacancySummary's doc comment.
    if (vacancySummaries.length > 0) {
      doc.addPage();
      renderVacancyPage(doc, propertyAddress, statement, vacancySummaries, categoryLabels);
    }

    // Stamp "Seite X von Y" only on sections that actually span more than one
    // page - a single-page tenant section doesn't need a "Seite 1 von 1" footer.
    for (const { start, end } of sectionPageRanges) {
      const total = end - start + 1;
      if (total <= 1) continue;
      for (let pageIndex = start; pageIndex <= end; pageIndex++) {
        doc.switchToPage(pageIndex);
        const pageNumber = pageIndex - start + 1;
        doc
          .fontSize(8)
          .fillColor("#666666")
          .text(`Seite ${pageNumber} von ${total}`, PAGE_MARGIN, doc.page.height - 40, { width: 495, align: "center" });
      }
    }

    doc.end();
  });
}

function renderVacancyPage(
  doc: PDFKit.PDFDocument,
  propertyAddress: string,
  statement: StatementDto,
  vacancySummaries: UnitVacancySummaryDto[],
  categoryLabels: Record<string, string>,
): void {
  doc.fontSize(15).fillColor("#000000").text(VACANCY_PAGE_TITLE, PAGE_MARGIN, PAGE_MARGIN, { width: 495 });
  doc
    .fontSize(10)
    .fillColor("#333333")
    .text(`${propertyAddress} · Zeitraum ${formatDate(statement.periodStart)} – ${formatDate(statement.periodEnd)}`, PAGE_MARGIN, doc.y + 4, {
      width: 495,
    });

  doc.fontSize(9).fillColor("#222222").text(VACANCY_PAGE_INTRO_TEXT, PAGE_MARGIN, doc.y + 14, { width: 495, align: "justify" });

  let y = doc.y + 20;
  for (const unit of vacancySummaries) {
    if (y > 680) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    doc.fontSize(11).fillColor("#000000").text(`Einheit: ${unit.unitLabel}`, PAGE_MARGIN, y, { width: 495 });
    y = doc.y + 4;

    const rangesText = unit.vacancyRanges.map((r) => `${formatDate(r.start)} – ${formatDate(r.end)}`).join(", ");
    doc.fontSize(9).fillColor("#333333").text(`Leerstandszeitraum: ${rangesText}`, PAGE_MARGIN, y, { width: 495 });
    y = doc.y + 2;
    doc.text(
      `Leerstandstage gesamt: ${unit.vacancyDays} · Vermieter-Anteil gesamt: ${formatCents(unit.totalVacancyShareCents)}`,
      PAGE_MARGIN,
      y,
      { width: 495 },
    );
    y = doc.y + 10;

    // Per-category breakdown only when there's more than one category with
    // vacancy-borne cost - a single category would just repeat the totals
    // line above.
    if (unit.categories.length > 1) {
      const colCat = { x: PAGE_MARGIN, width: 260 };
      const colDays = { x: PAGE_MARGIN + 270, width: 100 };
      const colShare = { x: PAGE_MARGIN + 380, width: 115 };

      doc.fontSize(9).fillColor("#000000");
      doc.moveTo(PAGE_MARGIN, y - 3).lineTo(PAGE_MARGIN + 495, y - 3).strokeColor("#cccccc").stroke();
      doc.text("Kostenart", colCat.x, y, { width: colCat.width });
      doc.text("Leerstandstage", colDays.x, y, { width: colDays.width, align: "right" });
      doc.text("Vermieter-Anteil", colShare.x, y, { width: colShare.width, align: "right" });
      y += 14;
      doc.moveTo(PAGE_MARGIN, y - 3).lineTo(PAGE_MARGIN + 495, y - 3).strokeColor("#cccccc").stroke();

      for (const category of unit.categories) {
        if (y > 720) {
          doc.addPage();
          y = PAGE_MARGIN;
        }
        const label = categoryLabels[category.costCategoryKey] ?? category.costCategoryKey;
        doc.fontSize(9).fillColor("#222222");
        doc.text(label, colCat.x, y, { width: colCat.width });
        doc.text(String(category.vacancyDays), colDays.x, y, { width: colDays.width, align: "right" });
        doc.text(formatCents(category.vacancyShareCents), colShare.x, y, { width: colShare.width, align: "right" });
        y += 14;
      }
    }

    y += 18;
  }
}

function renderTenantSection(
  doc: PDFKit.PDFDocument,
  property: PropertyDto,
  propertyAddress: string,
  landlord: LandlordProfileDto,
  statement: StatementDto,
  allLines: StatementLineDto[],
  summary: TenantSummaryForPdf,
  allSummaries: TenantSummaryForPdf[],
  categoryLabels: Record<string, string>,
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
  // Column layout: explicit ~10-12pt gaps between every column (not just
  // contiguous boxes) - a prior layout butted columns directly against each
  // other with zero gap, which looked especially cramped between the
  // right-aligned "Gesamtkosten Objekt" and the left-aligned
  // "Verteilerschlüssel" right next to it (their text visually touched).
  // "Verteilerschlüssel" also gets extra width and a smaller body font (8pt
  // vs the other columns' 9pt) since its content (e.g. "Extern (Techem)")
  // tends to run longer than the other columns' short numbers/percentages;
  // long provider names still wrap to a second line within the column
  // rather than stealing space from neighbors - see the dynamic row-height
  // calculation in the render loop below. Total width (110+85+120+55+83 +
  // gaps 10+12+10+10 = 495) still exactly matches the old total, staying
  // within the page margins.
  const colCategory = { x: PAGE_MARGIN, width: 110 };
  const colTotal = { x: PAGE_MARGIN + 120, width: 85 };
  const colKey = { x: PAGE_MARGIN + 217, width: 120 };
  const colShareLabel = { x: PAGE_MARGIN + 347, width: 55 };
  const colAmount = { x: PAGE_MARGIN + 412, width: 83 };

  doc.fontSize(9).fillColor("#000000");
  doc.moveTo(PAGE_MARGIN, tableY - 4).lineTo(PAGE_MARGIN + 495, tableY - 4).strokeColor("#cccccc").stroke();
  doc.text("Kostenart", colCategory.x, tableY, { width: colCategory.width });
  doc.text("Gesamtkosten", colTotal.x, tableY, { width: colTotal.width, align: "right" });
  doc.text("Verteilerschlüssel", colKey.x, tableY, { width: colKey.width });
  doc.text("Ihr Anteil", colShareLabel.x, tableY, { width: colShareLabel.width, align: "right" });
  doc.text("Betrag", colAmount.x, tableY, { width: colAmount.width, align: "right" });
  tableY += 16;
  doc.moveTo(PAGE_MARGIN, tableY - 4).lineTo(PAGE_MARGIN + 495, tableY - 4).strokeColor("#cccccc").stroke();

  // A unit covered by more than one lease segment in the period
  // (Mieterwechsel) has statement lines that carry the WHOLE unit's
  // full-period amount, shared identically by every one of its tenants -
  // see statementCalculation.ts::proratedLinesForSegment's doc comment.
  // Re-derive this specific tenant's own itemized share before rendering
  // the table/explanation, so they tie out with `summary.totalAllocatedCostCents`
  // instead of every co-tenant seeing the same full-unit amount.
  const rawUnitLines = allLines.filter((line) => line.unitId === summary.unitId);
  const unitSegmentDayRanges = allSummaries
    .filter((s) => s.unitId === summary.unitId)
    .map((s) => ({ start: s.segmentStart, end: s.segmentEnd }));
  const unitLines = proratedLinesForSegment(rawUnitLines, summary.segmentStart, summary.segmentEnd, unitSegmentDayRanges);
  let hasEstimatedLine = false;
  for (const line of unitLines) {
    if (line.unitShareCents === 0 && line.totalPropertyCostCents === 0) continue;
    if (tableY > 720) {
      doc.addPage();
      tableY = PAGE_MARGIN;
    }
    const categoryLabel = categoryLabels[line.costCategoryKey] ?? line.costCategoryKey;
    const sharePercent = line.totalPropertyCostCents > 0 ? `${((line.unitShareCents / line.totalPropertyCostCents) * 100).toFixed(1)}%` : "-";
    const keyLabel = allocationKeyLabel(line.allocationKeyUsed, line.externalProviderName);

    // "Verteilerschlüssel" runs at a smaller font (8pt vs 9pt for the rest
    // of the row) and is allowed to wrap to a second line within its own
    // column (e.g. a longer provider name) instead of overflowing into
    // "Ihr Anteil" - measure its actual wrapped height first so the row
    // (and every column in it) advances far enough to clear it.
    doc.fontSize(8);
    const keyLabelHeight = doc.heightOfString(keyLabel, { width: colKey.width });
    const rowHeight = Math.max(16, keyLabelHeight + 5);

    doc.fontSize(9).text(categoryLabel, colCategory.x, tableY, { width: colCategory.width });
    doc.text(formatCents(line.totalPropertyCostCents), colTotal.x, tableY, { width: colTotal.width, align: "right" });
    doc.fontSize(8).text(keyLabel, colKey.x, tableY, { width: colKey.width });
    doc.fontSize(9).text(sharePercent, colShareLabel.x, tableY, { width: colShareLabel.width, align: "right" });
    // Estimated (§9a HeizkostenV substitute) lines get a trailing "*"
    // marker so a substitute value never looks identical to a real metered
    // one in the output - see ESTIMATED_VALUE_FOOTNOTE below.
    const amountText = line.isEstimated ? `${formatCents(line.unitShareCents)} *` : formatCents(line.unitShareCents);
    if (line.isEstimated) hasEstimatedLine = true;
    doc.text(amountText, colAmount.x, tableY, { width: colAmount.width, align: "right" });
    tableY += rowHeight;
  }

  tableY += 8;
  doc.moveTo(PAGE_MARGIN + 330, tableY).lineTo(PAGE_MARGIN + 495, tableY).strokeColor("#cccccc").stroke();
  tableY += 8;

  // Deliberately `summary.totalAllocatedCostCents` (the engine's own
  // day-prorated per-segment total - see computeTenantSummaries), not a sum
  // of the rendered line amounts above: per-line rounding in
  // proratedLinesForSegment can drift by a cent or two from the
  // authoritative total, and the balance below is computed FROM
  // totalAllocatedCostCents - using anything else here could make "Summe
  // Kosten" and "Nachzahlung/Guthaben" fail to reconcile on the page.
  doc.fontSize(10).text("Summe Kosten:", PAGE_MARGIN + 330, tableY, { width: 80, align: "right" });
  doc.text(formatCents(summary.totalAllocatedCostCents), colAmount.x, tableY, { width: colAmount.width, align: "right" });
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
  const explanation = generateTenantExplanationParagraph(unitLines, summary, categoryLabels);
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
