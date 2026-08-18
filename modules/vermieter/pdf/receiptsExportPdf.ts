import PDFDocument from "pdfkit";
import { PDFDocument as PdfLibDocument } from "pdf-lib";
import { formatCents } from "@notorious/shared";
import { getCostCategory } from "../db/costCategories.js";
import type { ReceiptDto } from "../services/receipts.js";
import type { ReceiptDocumentDto } from "../services/receiptDocuments.js";

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

/** Renders a one-page pdfkit overview ("date, vendor, category, amount" + attached-document filenames) for one receipt, as a standalone PDF buffer to be merged into the export via pdf-lib. */
function renderOverviewPage(receipt: ReceiptDto, documents: ReceiptDocumentDto[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(13).fillColor("#000000").text("Beleg", 50, 50);
    doc.fontSize(10).fillColor("#333333");
    let y = 80;
    const row = (label: string, value: string) => {
      doc.text(label, 50, y, { width: 140 });
      doc.text(value, 190, y, { width: 355 });
      y += 18;
    };
    row("Datum:", formatDate(receipt.receiptDate));
    row("Lieferant/Anbieter:", receipt.vendor || "-");
    row("Kostenart:", getCostCategory(receipt.costCategoryKey)?.label ?? receipt.costCategoryKey);
    row("Betrag:", formatCents(receipt.amountCents));
    if (receipt.description) row("Beschreibung:", receipt.description);
    y += 10;
    doc.fontSize(9).fillColor("#666666").text("Angehängte Dokumente:", 50, y, { width: 495 });
    y += 16;
    if (documents.length === 0) {
      doc.text("(keine Dokumente angehängt)", 50, y, { width: 495 });
    } else {
      for (const document of documents) {
        doc.text(`- ${document.originalFilename} (${document.mimeType})`, 50, y, { width: 495 });
        y += 14;
      }
    }
    doc.end();
  });
}

/** Standalone note page (pdfkit, rendered into a merge-able buffer the same way as the overview page) for a document type pdf-lib can't embed. */
function renderUnsupportedDocumentNote(document: ReceiptDocumentDto): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `Originaldokument: ${document.originalFilename} (${document.mimeType}) - dieses Dateiformat kann nicht in dieses PDF eingebettet werden. Das Originaldokument ist über die Belegverwaltung separat abrufbar.`,
        50,
        50,
        { width: 495 },
      );
    doc.end();
  });
}

function renderEmptyNote(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(11).text("Keine Belege für diesen Abrechnungszeitraum gefunden.", 50, 50, { width: 495 });
    doc.end();
  });
}

async function appendPdfBufferPages(finalDoc: PdfLibDocument, buffer: Buffer): Promise<void> {
  const src = await PdfLibDocument.load(buffer);
  const pages = await finalDoc.copyPages(src, src.getPageIndices());
  for (const page of pages) finalDoc.addPage(page);
}

/**
 * Appends one document (image or PDF) to `finalDoc` as one or more full
 * pages. PDFs are truly merged page-by-page via pdf-lib (`copyPages`) -
 * genuine PDF-in-PDF embedding, not just a reference note. Images are
 * embedded via pdf-lib's own JPEG/PNG embedding and drawn full-page,
 * scaled to fit. Any other image format (or an undecodable file) falls
 * back to a short pdfkit-rendered note page rather than failing the whole
 * export.
 */
async function appendDocument(finalDoc: PdfLibDocument, buffer: Buffer, document: ReceiptDocumentDto): Promise<void> {
  if (document.mimeType === "application/pdf") {
    await appendPdfBufferPages(finalDoc, buffer);
    return;
  }
  if (document.mimeType === "image/jpeg" || document.mimeType === "image/jpg") {
    const image = await finalDoc.embedJpg(buffer);
    const page = finalDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return;
  }
  if (document.mimeType === "image/png") {
    const image = await finalDoc.embedPng(buffer);
    const page = finalDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return;
  }
  await appendPdfBufferPages(finalDoc, await renderUnsupportedDocumentNote(document));
}

export interface ReceiptForExport {
  receipt: ReceiptDto;
  documents: ReceiptDocumentDto[];
}

/**
 * Builds the "Belege für Mieter" export PDF (item 4 of this pass's brief):
 * one overview page per receipt (date/vendor/category/amount + attached-
 * document list), immediately followed by that receipt's own attached
 * documents, each fully embedded (real PDF pages via pdf-lib, or images).
 * `readDocumentFile` is injected (rather than this module reading storage
 * directly) so this stays a pure rendering function - routes/
 * receiptsExportPdf.ts does the sdk.storage.read calls.
 */
export async function renderReceiptsExportPdf(
  receipts: ReceiptForExport[],
  readDocumentFile: (document: ReceiptDocumentDto) => Promise<Buffer>,
): Promise<Buffer> {
  const finalDoc = await PdfLibDocument.create();

  for (const { receipt, documents } of receipts) {
    const overviewBuffer = await renderOverviewPage(receipt, documents);
    await appendPdfBufferPages(finalDoc, overviewBuffer);

    for (const document of documents) {
      try {
        const fileBuffer = await readDocumentFile(document);
        await appendDocument(finalDoc, fileBuffer, document);
      } catch {
        // A missing/corrupt stored file shouldn't fail the whole export -
        // note it and move on, same spirit as the unsupported-format path.
        await appendPdfBufferPages(finalDoc, await renderUnsupportedDocumentNote(document));
      }
    }
  }

  if (receipts.length === 0) {
    await appendPdfBufferPages(finalDoc, await renderEmptyNote());
  }

  const bytes = await finalDoc.save();
  return Buffer.from(bytes);
}
