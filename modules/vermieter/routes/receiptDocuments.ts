import type { FastifyInstance } from "fastify";
import type {} from "@fastify/multipart";
import type { ModuleSdk } from "../manifest.js";
import { requireReceiptRow } from "../services/receipts.js";
import {
  listReceiptDocuments,
  getReceiptDocumentRow,
  getReceiptDocumentDetail,
  createReceiptDocument,
  deleteReceiptDocument,
  combineImagesIntoPdf,
  triggerReceiptDocumentOcr,
} from "../services/receiptDocuments.js";

const ACCEPTED_SINGLE_MIME = /^image\/|^application\/pdf$/;
const ACCEPTED_IMAGE_MIME = /^image\//;

/**
 * Multi-document receipt attachments (item 3 of this pass's brief):
 *  - POST   /receipts/:id/documents                     - upload ONE file (image or PDF), no OCR run.
 *  - POST   /receipts/:id/documents/combine-pages        - upload MULTIPLE images, combined into one multi-page PDF document.
 *  - POST   /receipts/:id/documents/:documentId/ocr      - manually trigger OCR for one document ("OCR starten").
 *  - GET    /receipts/:id/documents                      - list documents (metadata only, no raw bytes/text).
 *  - GET    /receipts/:id/documents/:documentId/file     - stream the stored file.
 *  - DELETE /receipts/:id/documents/:documentId          - remove one document (row + stored file).
 *
 * OCR is never triggered automatically on upload - see services/receiptDocuments.ts's
 * doc comment: it's always a deliberate, user-initiated action via the `/ocr`
 * endpoint (the frontend's "OCR starten" button), so a slow/failed OCR run
 * never blocks or complicates the plain "attach this file" flow.
 */
export function registerReceiptDocumentRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/documents", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    try {
      requireReceiptRow(sdk, workspaceId, id);
    } catch {
      reply.code(404);
      return { message: "Receipt not found" };
    }
    return listReceiptDocuments(sdk, workspaceId, id);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/documents", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    try {
      requireReceiptRow(sdk, workspaceId, id);
    } catch {
      reply.code(404);
      return { message: "Receipt not found" };
    }

    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { message: "No file was uploaded" };
    }
    if (!ACCEPTED_SINGLE_MIME.test(data.mimetype)) {
      reply.code(400);
      return { message: "Only image or application/pdf files are accepted" };
    }
    const buffer = await data.toBuffer();
    // See routes/receipts.ts's identical doc comment: sharp (used for
    // resize-before-store elsewhere in the app) can't be imported from this
    // module's independent build in this repo's install layout, so
    // documents are stored at their original resolution.
    const { storagePath } = await sdk.storage.write(`vermieter/${workspaceId}/receipts/${id}`, data.filename, buffer);
    reply.code(201);
    return createReceiptDocument(sdk, workspaceId, {
      receiptId: id,
      storagePath,
      mimeType: data.mimetype,
      originalFilename: data.filename,
    });
  });

  // Camera multi-page-scan flow: several image files in one multipart
  // request, combined server-side into a single multi-page PDF document.
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/documents/combine-pages", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    try {
      requireReceiptRow(sdk, workspaceId, id);
    } catch {
      reply.code(404);
      return { message: "Receipt not found" };
    }

    const images: Buffer[] = [];
    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (!ACCEPTED_IMAGE_MIME.test(part.mimetype)) continue;
        images.push(await part.toBuffer());
      }
    }
    if (images.length === 0) {
      reply.code(400);
      return { message: "At least one image file is required" };
    }

    const pdfBuffer = await combineImagesIntoPdf(images);
    const { storagePath } = await sdk.storage.write(`vermieter/${workspaceId}/receipts/${id}`, `scan-${Date.now()}.pdf`, pdfBuffer);
    reply.code(201);
    return createReceiptDocument(sdk, workspaceId, {
      receiptId: id,
      storagePath,
      mimeType: "application/pdf",
      originalFilename: `Scan (${images.length} Seiten).pdf`,
      pageCount: images.length,
    });
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/documents/:documentId/ocr", async (request, reply) => {
    const { workspaceId, id, documentId } = request.params as { workspaceId: string; id: string; documentId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    const result = await triggerReceiptDocumentOcr(sdk, workspaceId, id, documentId);
    if (!result) {
      reply.code(404);
      return { message: "Document not found" };
    }
    return result;
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/documents/:documentId/file", async (request, reply) => {
    const { workspaceId, id, documentId } = request.params as { workspaceId: string; id: string; documentId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    const row = getReceiptDocumentRow(sdk, workspaceId, id, documentId);
    if (!row) {
      reply.code(404);
      return { message: "Document not found" };
    }
    const buffer = await sdk.storage.read(row.storage_path);
    reply.header("Content-Type", row.mime_type || "application/octet-stream");
    reply.header("Content-Disposition", `inline; filename="${row.original_filename}"`);
    return reply.send(buffer);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/documents/:documentId", async (request, reply) => {
    const { workspaceId, id, documentId } = request.params as { workspaceId: string; id: string; documentId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    const detail = getReceiptDocumentDetail(sdk, workspaceId, id, documentId);
    if (!detail) {
      reply.code(404);
      return { message: "Document not found" };
    }
    return detail;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/documents/:documentId", async (request, reply) => {
    const { workspaceId, id, documentId } = request.params as { workspaceId: string; id: string; documentId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    const deleted = await deleteReceiptDocument(sdk, workspaceId, id, documentId);
    if (!deleted) {
      reply.code(404);
      return { message: "Document not found" };
    }
    reply.code(204);
  });
}
