import PDFDocument from "pdfkit";
import { formatCents } from "@notorious/shared";
import type { DocumentDto } from "../services/documents.js";
import type { CompanySettingsDto } from "../services/companySettings.js";
import { unitLabelDe, taxRateLabel } from "./text.de.js";
import { drawTestBanner } from "./testBanner.js";

// 80mm thermal-receipt width in PDF points (1mm ≈ 2.8346pt).
const PAGE_WIDTH = 227;
const MARGIN = 10;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatDateTime(iso: string): string {
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 16);
  const [year, month, day] = datePart.split("-");
  return `${day}.${month}.${year} ${timePart}`;
}

/** Renders a POS sale as a narrow 80mm receipt PDF - reuses pdfkit like pdf/render.ts, just a different page size/layout since a Kassenbon has no full invoice letterhead, just a compact line-item summary. No printer integration in Phase 3 (see the phase plan) - PDF/screen only. */
export function renderPosReceiptPdf(document: DocumentDto, company: CompanySettingsDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_WIDTH, 1000], margin: MARGIN, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;
    if (company.testMode) {
      drawTestBanner(doc, PAGE_WIDTH);
      y += 20;
    }
    doc.fontSize(10).text(company.legalName, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
    y += 14;
    doc.fontSize(7).fillColor("#333333").text(`${company.street}, ${company.postalCode} ${company.city}`, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
    y += 16;

    doc.fontSize(8).fillColor("#000000").text(`Kassenbon ${document.number ?? ""}`, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
    y += 12;
    doc.fontSize(7).fillColor("#333333").text(formatDateTime(document.issueDate ? `${document.issueDate}T${document.createdAt.slice(11, 16)}` : document.createdAt), MARGIN, y, {
      width: CONTENT_WIDTH,
      align: "center",
    });
    y += 16;

    doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor("#999999").stroke();
    y += 6;

    doc.fontSize(8).fillColor("#000000");
    for (const line of document.lines) {
      const unitLabel = unitLabelDe[line.unit] ?? line.unit;
      doc.text(line.description, MARGIN, y, { width: CONTENT_WIDTH });
      y += 11;
      doc.fontSize(7).fillColor("#555555").text(`${line.quantity} ${unitLabel} x ${formatCents(line.unitPriceCents)}`, MARGIN, y, { width: CONTENT_WIDTH - 60 });
      doc.text(formatCents(line.lineTotalCents), MARGIN, y, { width: CONTENT_WIDTH, align: "right" });
      doc.fontSize(8).fillColor("#000000");
      y += 13;
    }

    y += 4;
    doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).strokeColor("#999999").stroke();
    y += 8;

    for (const entry of document.taxBreakdown) {
      doc.fontSize(7).fillColor("#555555").text(`davon USt. ${taxRateLabel(entry.taxRateBasisPoints)}`, MARGIN, y, { width: CONTENT_WIDTH - 60 });
      doc.text(formatCents(entry.taxTotalCents), MARGIN, y, { width: CONTENT_WIDTH, align: "right" });
      y += 11;
    }

    y += 4;
    doc.fontSize(10).fillColor("#000000").text("Summe", MARGIN, y, { width: CONTENT_WIDTH - 60 });
    doc.text(formatCents(document.totalCents), MARGIN, y, { width: CONTENT_WIDTH, align: "right" });
    y += 20;

    if (document.legalDisclaimerText) {
      doc.fontSize(6).fillColor("#555555").text(document.legalDisclaimerText, MARGIN, y, { width: CONTENT_WIDTH });
      y += 20;
    }

    doc.fontSize(7).fillColor("#333333").text("Vielen Dank!", MARGIN, y, { width: CONTENT_WIDTH, align: "center" });

    doc.end();
  });
}
