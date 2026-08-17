import PDFDocument from "pdfkit";
import { formatCents } from "@notorious/shared";
import type { DocumentDto } from "../services/documents.js";
import type { CompanySettingsDto } from "../services/companySettings.js";
import type { CustomerDto } from "../services/customers.js";
import { documentTypeLabel, unitLabelDe, taxRateLabel } from "./text.de.js";
import { drawTestBanner } from "./testBanner.js";

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 width in pt

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

/**
 * Renders a Quote/Order/Invoice/Credit-Note as a PDF buffer using pdfkit -
 * chosen over @react-pdf/renderer/puppeteer specifically because it's pure
 * JS with no native binary and no headless-browser dependency (see the
 * phase plan: avoids the class of prod-CPU compatibility risk that hit
 * `sharp` on this server, since pdfkit ships no prebuilt binary at all).
 */
export function renderDocumentPdf(document: DocumentDto, customer: CustomerDto, company: CompanySettingsDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (company.testMode) drawTestBanner(doc, PAGE_WIDTH);

    doc.fontSize(8).fillColor("#666666").text(`${company.legalName} · ${company.street} · ${company.postalCode} ${company.city}`, PAGE_MARGIN, PAGE_MARGIN);

    const addressTop = PAGE_MARGIN + 30;
    doc.fontSize(10).fillColor("#000000");
    doc.text(customer.displayName, PAGE_MARGIN, addressTop);
    doc.text(document.billingAddress.street, PAGE_MARGIN, addressTop + 14);
    doc.text(`${document.billingAddress.postalCode} ${document.billingAddress.city}`, PAGE_MARGIN, addressTop + 28);
    if (document.billingAddress.country && document.billingAddress.country !== "DE") {
      doc.text(document.billingAddress.country, PAGE_MARGIN, addressTop + 42);
    }

    const companyBoxX = 350;
    doc.fontSize(9);
    let y = addressTop;
    const companyLines = [
      company.legalName,
      company.street,
      `${company.postalCode} ${company.city}`,
      company.taxNumber ? `Steuernr.: ${company.taxNumber}` : "",
      company.vatId ? `USt-IdNr.: ${company.vatId}` : "",
    ].filter(Boolean);
    for (const line of companyLines) {
      doc.text(line, companyBoxX, y, { width: 195, align: "right" });
      y += 13;
    }

    const titleY = addressTop + 90;
    doc.fontSize(16).text(`${documentTypeLabel[document.type]} ${document.number ?? "(Entwurf)"}`, PAGE_MARGIN, titleY);
    doc.fontSize(9).fillColor("#333333");
    const metaY = titleY + 24;
    doc.text(`Datum: ${formatDate(document.issueDate)}`, PAGE_MARGIN, metaY);
    if (document.dueDate) doc.text(`Fällig am: ${formatDate(document.dueDate)}`, PAGE_MARGIN, metaY + 12);

    let tableY = metaY + 40;
    const colDescription = { x: PAGE_MARGIN, width: 210 };
    const colQuantity = { x: PAGE_MARGIN + 210, width: 50 };
    const colUnitPrice = { x: PAGE_MARGIN + 260, width: 70 };
    const colTaxRate = { x: PAGE_MARGIN + 330, width: 40 };
    const colTotal = { x: PAGE_MARGIN + 370, width: 80 };
    const columns = [
      { label: "Beschreibung", ...colDescription, align: "left" as const },
      { label: "Menge", ...colQuantity, align: "right" as const },
      { label: "Einzelpreis", ...colUnitPrice, align: "right" as const },
      { label: "USt.", ...colTaxRate, align: "right" as const },
      { label: "Gesamt", ...colTotal, align: "right" as const },
    ];

    doc.fontSize(9).fillColor("#000000");
    doc.moveTo(PAGE_MARGIN, tableY - 4).lineTo(PAGE_MARGIN + 450, tableY - 4).strokeColor("#cccccc").stroke();
    for (const col of columns) doc.text(col.label, col.x, tableY, { width: col.width, align: col.align });
    tableY += 16;
    doc.moveTo(PAGE_MARGIN, tableY - 4).lineTo(PAGE_MARGIN + 450, tableY - 4).strokeColor("#cccccc").stroke();

    for (const line of document.lines) {
      if (tableY > 720) {
        doc.addPage();
        if (company.testMode) drawTestBanner(doc, PAGE_WIDTH);
        tableY = PAGE_MARGIN;
      }
      const unitLabel = unitLabelDe[line.unit] ?? line.unit;
      doc.text(line.description, colDescription.x, tableY, { width: colDescription.width });
      doc.text(`${line.quantity} ${unitLabel}`, colQuantity.x, tableY, { width: colQuantity.width, align: "right" });
      doc.text(formatCents(line.unitPriceCents), colUnitPrice.x, tableY, { width: colUnitPrice.width, align: "right" });
      doc.text(taxRateLabel(line.taxRateBasisPoints), colTaxRate.x, tableY, { width: colTaxRate.width, align: "right" });
      doc.text(formatCents(line.lineTotalCents), colTotal.x, tableY, { width: colTotal.width, align: "right" });
      tableY += 16;
    }

    tableY += 8;
    doc.moveTo(PAGE_MARGIN + 260, tableY).lineTo(PAGE_MARGIN + 450, tableY).strokeColor("#cccccc").stroke();
    tableY += 8;

    doc.text("Zwischensumme:", PAGE_MARGIN + 260, tableY, { width: 110, align: "right" });
    doc.text(formatCents(document.subtotalCents), PAGE_MARGIN + 370, tableY, { width: 80, align: "right" });
    tableY += 14;

    for (const entry of document.taxBreakdown) {
      doc.text(`USt. ${taxRateLabel(entry.taxRateBasisPoints)}:`, PAGE_MARGIN + 260, tableY, { width: 110, align: "right" });
      doc.text(formatCents(entry.taxTotalCents), PAGE_MARGIN + 370, tableY, { width: 80, align: "right" });
      tableY += 14;
    }

    doc.fontSize(10).text("Gesamtbetrag:", PAGE_MARGIN + 260, tableY, { width: 110, align: "right" });
    doc.text(formatCents(document.totalCents), PAGE_MARGIN + 370, tableY, { width: 80, align: "right" });
    tableY += 24;

    if (document.legalDisclaimerText) {
      doc.fontSize(8).fillColor("#333333").text(document.legalDisclaimerText, PAGE_MARGIN, tableY, { width: 450 });
      tableY += 20;
    }

    if (document.notes) {
      doc.fontSize(9).fillColor("#000000").text(document.notes, PAGE_MARGIN, tableY, { width: 450 });
    }

    const footerY = 760;
    doc.fontSize(7).fillColor("#666666").text(
      [
        company.legalName,
        company.bankName ? `${company.bankName}` : "",
        company.iban ? `IBAN: ${company.iban}` : "",
        company.bic ? `BIC: ${company.bic}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      PAGE_MARGIN,
      footerY,
      { width: 450, align: "center" },
    );

    doc.end();
  });
}
