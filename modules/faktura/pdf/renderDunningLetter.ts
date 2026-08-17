import PDFDocument from "pdfkit";
import { formatCents } from "@notorious/shared";
import type { DunningLetterDto } from "../services/dunning.js";
import type { DocumentDto } from "../services/documents.js";
import type { CompanySettingsDto } from "../services/companySettings.js";
import type { CustomerDto } from "../services/customers.js";
import { dunningLevelTitle, dunningLevelBodyText } from "./text.de.js";

const PAGE_MARGIN = 50;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

/** Renders a dunning letter (Zahlungserinnerung/Mahnung) as a PDF buffer - same pdfkit choice/reasoning as pdf/render.ts, deliberately a much simpler single-summary layout since a dunning letter has no line items of its own, just a reference to the overdue invoice plus fee/interest. */
export function renderDunningLetterPdf(letter: DunningLetterDto, invoice: DocumentDto, customer: CustomerDto, company: CompanySettingsDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(8).fillColor("#666666").text(`${company.legalName} · ${company.street} · ${company.postalCode} ${company.city}`, PAGE_MARGIN, PAGE_MARGIN);

    const addressTop = PAGE_MARGIN + 30;
    doc.fontSize(10).fillColor("#000000");
    doc.text(customer.displayName, PAGE_MARGIN, addressTop);
    doc.text(invoice.billingAddress.street, PAGE_MARGIN, addressTop + 14);
    doc.text(`${invoice.billingAddress.postalCode} ${invoice.billingAddress.city}`, PAGE_MARGIN, addressTop + 28);

    const titleY = addressTop + 90;
    doc.fontSize(16).text(`${dunningLevelTitle[letter.level]} ${letter.number ?? "(Entwurf)"}`, PAGE_MARGIN, titleY);
    doc.fontSize(9).fillColor("#333333").text(`Datum: ${formatDate(letter.issueDate)}`, PAGE_MARGIN, titleY + 24);

    let y = titleY + 50;
    doc.fontSize(10).fillColor("#000000").text("Sehr geehrte Damen und Herren,", PAGE_MARGIN, y, { width: 450 });
    y += 20;
    doc.text(dunningLevelBodyText[letter.level], PAGE_MARGIN, y, { width: 450 });
    y += 70;

    doc.fontSize(10);
    doc.text(`Rechnung ${invoice.number ?? ""} vom ${formatDate(invoice.issueDate)}, fällig am ${formatDate(invoice.dueDate)}:`, PAGE_MARGIN, y, {
      width: 450,
    });
    y += 24;

    doc.text("Offener Rechnungsbetrag:", PAGE_MARGIN, y, { width: 300 });
    doc.text(formatCents(letter.openAmountCents), PAGE_MARGIN + 320, y, { width: 130, align: "right" });
    y += 16;

    if (letter.feeCents > 0) {
      doc.text("Mahngebühr:", PAGE_MARGIN, y, { width: 300 });
      doc.text(formatCents(letter.feeCents), PAGE_MARGIN + 320, y, { width: 130, align: "right" });
      y += 16;
    }

    if (letter.interestCents > 0) {
      doc.text(`Verzugszinsen (${letter.daysOverdue} Tage):`, PAGE_MARGIN, y, { width: 300 });
      doc.text(formatCents(letter.interestCents), PAGE_MARGIN + 320, y, { width: 130, align: "right" });
      y += 16;
    }

    y += 8;
    doc.moveTo(PAGE_MARGIN + 220, y).lineTo(PAGE_MARGIN + 450, y).strokeColor("#cccccc").stroke();
    y += 8;

    doc.fontSize(11).text("Gesamt fällig:", PAGE_MARGIN, y, { width: 300 });
    doc.text(formatCents(letter.totalDueCents), PAGE_MARGIN + 320, y, { width: 130, align: "right" });
    y += 30;

    doc.fontSize(10).text("Mit freundlichen Grüßen", PAGE_MARGIN, y);
    y += 14;
    doc.text(company.legalName, PAGE_MARGIN, y);

    const footerY = 760;
    doc.fontSize(7).fillColor("#666666").text(
      [company.legalName, company.bankName, company.iban ? `IBAN: ${company.iban}` : "", company.bic ? `BIC: ${company.bic}` : ""]
        .filter(Boolean)
        .join(" · "),
      PAGE_MARGIN,
      footerY,
      { width: 450, align: "center" },
    );

    doc.end();
  });
}
