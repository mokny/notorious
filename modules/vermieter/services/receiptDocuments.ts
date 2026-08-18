import PDFDocument from "pdfkit";
import type { ModuleSdk } from "../manifest.js";
import type { VermieterReceiptDocumentOcrStatus, VermieterReceiptDocumentRow } from "../db/types.js";
import { runReceiptDocumentOcr } from "./ocr.js";

/**
 * Multi-document attachments per receipt (photos and/or PDFs) - see
 * migrations/0010's doc comment for why this replaces the old single
 * `vermieter_receipts.storage_path`/`ocr_raw_text` columns going forward.
 * OCR is never run automatically on upload here (see routes/receiptDocuments.ts's
 * doc comment) - only `triggerOcr` runs it, on demand, per document.
 */

export interface ReceiptDocumentDto {
  id: string;
  receiptId: string;
  mimeType: string;
  originalFilename: string;
  ocrStatus: VermieterReceiptDocumentOcrStatus;
  pageCount: number | null;
  createdAt: string;
}

export interface ReceiptDocumentDetailDto extends ReceiptDocumentDto {
  ocrRawText: string | null;
}

function rowToDto(row: VermieterReceiptDocumentRow): ReceiptDocumentDto {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    ocrStatus: row.ocr_status,
    pageCount: row.page_count,
    createdAt: row.created_at,
  };
}

function rowToDetailDto(row: VermieterReceiptDocumentRow): ReceiptDocumentDetailDto {
  return { ...rowToDto(row), ocrRawText: row.ocr_raw_text };
}

export function listReceiptDocuments(sdk: ModuleSdk, workspaceId: string, receiptId: string): ReceiptDocumentDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM vermieter_receipt_documents WHERE workspace_id = ? AND receipt_id = ? ORDER BY created_at ASC")
    .all(workspaceId, receiptId) as VermieterReceiptDocumentRow[];
  return rows.map(rowToDto);
}

export function getReceiptDocumentRow(sdk: ModuleSdk, workspaceId: string, receiptId: string, id: string): VermieterReceiptDocumentRow | null {
  const row = sdk.sqlite
    .prepare("SELECT * FROM vermieter_receipt_documents WHERE id = ? AND workspace_id = ? AND receipt_id = ?")
    .get(id, workspaceId, receiptId) as VermieterReceiptDocumentRow | undefined;
  return row ?? null;
}

export function getReceiptDocumentDetail(sdk: ModuleSdk, workspaceId: string, receiptId: string, id: string): ReceiptDocumentDetailDto | null {
  const row = getReceiptDocumentRow(sdk, workspaceId, receiptId, id);
  return row ? rowToDetailDto(row) : null;
}

/** Every document row for every receipt in a workspace - used by services/reset.ts's scoped "Belege" reset to find storage paths to delete. */
export function listAllReceiptDocumentStoragePaths(sdk: ModuleSdk, workspaceId: string): string[] {
  const rows = sdk.sqlite.prepare("SELECT storage_path FROM vermieter_receipt_documents WHERE workspace_id = ?").all(workspaceId) as {
    storage_path: string;
  }[];
  return rows.map((r) => r.storage_path);
}

export interface CreateReceiptDocumentInput {
  receiptId: string;
  storagePath: string;
  mimeType: string;
  originalFilename: string;
  pageCount?: number | null;
}

export function createReceiptDocument(sdk: ModuleSdk, workspaceId: string, input: CreateReceiptDocumentInput): ReceiptDocumentDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO vermieter_receipt_documents
       (id, workspace_id, receipt_id, storage_path, mime_type, original_filename, ocr_status, ocr_raw_text, page_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'none', NULL, ?, ?)`,
    )
    .run(id, workspaceId, input.receiptId, input.storagePath, input.mimeType, input.originalFilename, input.pageCount ?? null, now);
  return rowToDto(getReceiptDocumentRow(sdk, workspaceId, input.receiptId, id)!);
}

export async function deleteReceiptDocument(sdk: ModuleSdk, workspaceId: string, receiptId: string, id: string): Promise<boolean> {
  const row = getReceiptDocumentRow(sdk, workspaceId, receiptId, id);
  if (!row) return false;
  sdk.sqlite.prepare("DELETE FROM vermieter_receipt_documents WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
  await sdk.storage.delete(row.storage_path);
  return true;
}

/**
 * Combines multiple uploaded image buffers into a single multi-page PDF
 * (one page per image, fitted to the page with margins) - the server side of
 * the "camera multi-page-scan" flow (see routes/receiptDocuments.ts's
 * `combine-pages` endpoint). Returns the finished PDF as a Buffer; the
 * caller stores it via sdk.storage.write and creates one
 * vermieter_receipt_documents row for it.
 */
export function combineImagesIntoPdf(images: Buffer[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    for (const image of images) {
      doc.addPage({ size: "A4", margin: 20 });
      const pageWidth = doc.page.width - 40;
      const pageHeight = doc.page.height - 40;
      doc.image(image, 20, 20, { fit: [pageWidth, pageHeight], align: "center", valign: "center" });
    }
    doc.end();
  });
}

export interface TriggerOcrResult {
  ocrStatus: VermieterReceiptDocumentOcrStatus;
  rawText: string | null;
  guessedAmountCents: number | null;
  guessedDate: string | null;
  guessedVendor: string | null;
}

/**
 * Runs OCR for one document on demand (never automatically - see
 * routes/receiptDocuments.ts's doc comment on the manual "OCR starten"
 * button this backs) and persists the result. Synchronous from the caller's
 * point of view (awaited inline in the route handler) since tesseract/
 * pdf-parse runs are a few seconds at most for a single receipt document,
 * not worth a background job queue this module doesn't otherwise have.
 */
export async function triggerReceiptDocumentOcr(sdk: ModuleSdk, workspaceId: string, receiptId: string, id: string): Promise<TriggerOcrResult | null> {
  const row = getReceiptDocumentRow(sdk, workspaceId, receiptId, id);
  if (!row) return null;

  sdk.sqlite.prepare("UPDATE vermieter_receipt_documents SET ocr_status = 'pending' WHERE id = ?").run(id);

  try {
    const buffer = await sdk.storage.read(row.storage_path);
    const result = await runReceiptDocumentOcr(buffer, row.mime_type);
    sdk.sqlite
      .prepare("UPDATE vermieter_receipt_documents SET ocr_status = 'done', ocr_raw_text = ?, page_count = COALESCE(?, page_count) WHERE id = ?")
      .run(result.rawText, result.pageCount, id);
    return {
      ocrStatus: "done",
      rawText: result.rawText,
      guessedAmountCents: result.guessedAmountCents,
      guessedDate: result.guessedDate,
      guessedVendor: result.guessedVendor,
    };
  } catch {
    sdk.sqlite.prepare("UPDATE vermieter_receipt_documents SET ocr_status = 'failed' WHERE id = ?").run(id);
    return { ocrStatus: "failed", rawText: null, guessedAmountCents: null, guessedDate: null, guessedVendor: null };
  }
}
