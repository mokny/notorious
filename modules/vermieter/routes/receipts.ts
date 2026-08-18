import type { FastifyInstance } from "fastify";
import type {} from "@fastify/multipart";
import type { ModuleSdk } from "../manifest.js";
import { listReceipts, getReceipt, createReceipt, updateReceipt, deleteReceipt, type ReceiptInput } from "../services/receipts.js";
import { runReceiptOcr } from "../services/ocr.js";
import type { VermieterAllocationKey } from "../db/types.js";

const VALID_ALLOCATION_OVERRIDES: VermieterAllocationKey[] = ["sqm", "persons", "units", "consumption", "fixed_manual"];

function parseInput(body: unknown): ReceiptInput | null {
  const b = body as Partial<ReceiptInput> | null;
  if (!b || typeof b.propertyId !== "string" || !b.propertyId) return null;
  if (typeof b.costCategoryKey !== "string" || !b.costCategoryKey) return null;
  if (typeof b.amountCents !== "number" || !Number.isInteger(b.amountCents) || b.amountCents <= 0) return null;
  if (typeof b.receiptDate !== "string" || !b.receiptDate) return null;
  if (b.allocationKeyOverride && !VALID_ALLOCATION_OVERRIDES.includes(b.allocationKeyOverride)) return null;
  return {
    propertyId: b.propertyId,
    costCategoryKey: b.costCategoryKey,
    vendor: b.vendor,
    amountCents: b.amountCents,
    receiptDate: b.receiptDate,
    description: b.description,
    allocationKeyOverride: b.allocationKeyOverride ?? null,
    targetUnitId: b.targetUnitId ?? null,
    storagePath: b.storagePath ?? null,
    ocrRawText: b.ocrRawText ?? null,
    taxDeductible: b.taxDeductible,
    costCircuitId: b.costCircuitId ?? null,
  };
}

function readTextField(field: unknown): string | null {
  if (field && typeof field === "object" && "value" in field && typeof field.value === "string") return field.value;
  return null;
}

export function registerReceiptRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { propertyId, from, to } = request.query as { propertyId?: string; from?: string; to?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    return listReceipts(sdk, workspaceId, { propertyId, from, to });
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    const receipt = getReceipt(sdk, workspaceId, id);
    if (!receipt) {
      reply.code(404);
      return { message: "Receipt not found" };
    }
    return receipt;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "propertyId, costCategoryKey, amountCents and receiptDate are required" };
    }
    reply.code(201);
    return createReceipt(sdk, workspaceId, input);
  });

  app.patch("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    const updated = updateReceipt(sdk, workspaceId, id, (request.body as Partial<ReceiptInput>) ?? {});
    if (!updated) {
      reply.code(404);
      return { message: "Receipt not found" };
    }
    return updated;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    const deleted = deleteReceipt(sdk, workspaceId, id);
    if (!deleted) {
      reply.code(404);
      return { message: "Receipt not found" };
    }
    reply.code(204);
  });

  // @deprecated Legacy single-photo OCR-before-create flow, kept working
  // as-is for backward compatibility but superseded by the multi-document
  // flow: POST .../receipts/:id/documents (upload, no OCR) followed by
  // POST .../receipts/:id/documents/:documentId/ocr (manual OCR trigger) -
  // see routes/receiptDocuments.ts. New frontend code should use that
  // instead; this endpoint's returned `storagePath` is no longer consumed
  // by createReceipt (see ReceiptInput.storagePath's doc comment).
  //
  // Runs OCR over an uploaded receipt photo and returns a best-effort guess
  // WITHOUT creating a receipt row - the caller reviews/corrects the guess
  // and then calls POST .../receipts normally. See services/ocr.ts's doc
  // comment.
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/ocr", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");

    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { message: "No file was uploaded" };
    }
    const propertyId = readTextField(data.fields.propertyId);
    const buffer = await data.toBuffer();

    // Deviation from the spec's sharp-based EXIF-safe resize-before-OCR
    // pattern (see packages/server/src/modules/files/imageResize.ts): sharp
    // is only reachable from packages/server's own node_modules in this
    // repo's npm-workspaces install layout (it isn't hoisted to the root
    // node_modules /modules resolves against, unlike pdfkit/tesseract.js),
    // so it can't be imported here without either vendoring a duplicate
    // native binary resolution path or adding it as this module's own
    // dependency (no per-module package.json exists in this module system -
    // see /modules/tsconfig.json's single shared compilation). Receipt
    // photos are stored/OCR'd at their original resolution instead; if a
    // module-local dependency mechanism is added later, wiring the same
    // resize-before-store step back in is a small follow-up.
    const { storagePath } = await sdk.storage.write(`vermieter/${workspaceId}/receipts${propertyId ? `/${propertyId}` : ""}`, data.filename, buffer);
    const guess = await runReceiptOcr(buffer);

    return {
      storagePath,
      rawText: guess.rawText,
      guessedAmountCents: guess.guessedAmountCents,
      guessedDate: guess.guessedDate,
      guessedVendor: guess.guessedVendor,
    };
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/receipts/:id/photo", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    const receipt = getReceipt(sdk, workspaceId, id);
    if (!receipt || !receipt.storagePath) {
      reply.code(404);
      return { message: "Receipt photo not found" };
    }
    const buffer = await sdk.storage.read(receipt.storagePath);
    reply.header("Content-Type", "application/octet-stream");
    return reply.send(buffer);
  });
}
