import PDFDocument from "pdfkit";
import { formatCents } from "@notorious/shared";
import { getCostCategory } from "../db/costCategories.js";
import type { TaxOverviewDto } from "../services/taxOverview.js";
import type { PropertyDto } from "../services/properties.js";

const PAGE_MARGIN = 50;

export function renderTaxOverviewPdf(property: PropertyDto, overview: TaxOverviewDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(`Steuerübersicht ${overview.year} (Anlage V - Vorbereitung)`, PAGE_MARGIN, PAGE_MARGIN);
    doc.fontSize(10).fillColor("#333333").text(`${property.name} - ${property.street} ${property.houseNumber}, ${property.postalCode} ${property.city}`, PAGE_MARGIN, PAGE_MARGIN + 26);

    let y = PAGE_MARGIN + 60;
    const row = (label: string, valueCents: number, opts?: { bold?: boolean }) => {
      doc.fontSize(opts?.bold ? 11 : 10).fillColor("#000000");
      doc.text(label, PAGE_MARGIN, y, { width: 300 });
      doc.text(formatCents(valueCents), PAGE_MARGIN + 350, y, { width: 145, align: "right" });
      y += 18;
    };

    row("Mieteinnahmen (Kaltmiete, erhalten)", overview.rentIncomeCents);
    row("Abzugsfähige Werbungskosten", -overview.deductibleExpensesCents);
    row(`AfA (${overview.afaRatePercent}% linear)`, -overview.afaCents);
    y += 6;
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + 495, y).strokeColor("#000000").stroke();
    y += 10;
    row("Ergebnis (vor Steuer)", overview.netResultCents, { bold: true });

    y += 20;
    doc.fontSize(11).text("Werbungskosten nach Kategorie", PAGE_MARGIN, y);
    y += 18;
    for (const entry of overview.expensesByCategoryKey) {
      const label = getCostCategory(entry.costCategoryKey)?.label ?? entry.costCategoryKey;
      row(label, entry.amountCents);
    }

    y += 20;
    doc.fontSize(8).fillColor("#666666").text(overview.simplificationNote, PAGE_MARGIN, y, { width: 495 });

    doc.end();
  });
}

/** Simple CSV export - one row per expense category plus the summary rows, cents kept as plain integers (not German-formatted) so it round-trips through spreadsheet tools without locale ambiguity. */
export function renderTaxOverviewCsv(overview: TaxOverviewDto): string {
  const lines: string[] = ["Posten;BetragCent"];
  lines.push(`Mieteinnahmen;${overview.rentIncomeCents}`);
  lines.push(`Abzugsfaehige Werbungskosten;${-overview.deductibleExpensesCents}`);
  lines.push(`AfA (${overview.afaRatePercent}% linear);${-overview.afaCents}`);
  lines.push(`Ergebnis;${overview.netResultCents}`);
  lines.push("");
  lines.push("Kategorie;BetragCent");
  for (const entry of overview.expensesByCategoryKey) {
    const label = getCostCategory(entry.costCategoryKey)?.label ?? entry.costCategoryKey;
    lines.push(`${label};${entry.amountCents}`);
  }
  return lines.join("\n");
}
