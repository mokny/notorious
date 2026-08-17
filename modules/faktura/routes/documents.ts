import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import {
  listDocuments,
  getDocument,
  createDraftDocument,
  updateDraftDocument,
  deleteDraftDocument,
  type DocumentInput,
} from "../services/documents.js";
import { issueDocument, cancelDocument } from "../services/numbering.js";
import { cancelPosSale } from "../services/pos.js";
import { convertDocument, listDerivedDocuments } from "../services/documentConversion.js";
import { sendDocumentByEmail } from "../services/email.js";
import { renderAndMaybeCachePdf } from "./documentPdf.js";
import { recordAudit } from "../services/audit.js";
import type { FakturaDocumentType, FakturaTaxRateBasisPoints } from "../db/types.js";

const VALID_TYPES: FakturaDocumentType[] = ["quote", "order", "invoice", "credit_note"];
const VALID_TAX_RATES: FakturaTaxRateBasisPoints[] = [0, 700, 1900];

function parseInput(body: unknown): DocumentInput | null {
  const b = body as Partial<DocumentInput> | null;
  if (!b || !b.type || !VALID_TYPES.includes(b.type)) return null;
  if (typeof b.customerId !== "string" || !b.customerId) return null;
  if (!Array.isArray(b.lines)) return null;
  for (const line of b.lines) {
    if (typeof line.description !== "string" || !line.description.trim()) return null;
    if (typeof line.quantity !== "number" || line.quantity <= 0) return null;
    if (typeof line.unitPriceCents !== "number" || !Number.isInteger(line.unitPriceCents)) return null;
    if (!VALID_TAX_RATES.includes(line.taxRateBasisPoints)) return null;
  }
  return {
    type: b.type,
    customerId: b.customerId,
    sourceDocumentId: b.sourceDocumentId ?? null,
    billingAddress: b.billingAddress,
    shippingAddress: b.shippingAddress,
    dueDate: b.dueDate ?? null,
    notes: b.notes,
    lines: b.lines,
  };
}

const typePermission = { view: "faktura.documents.view", manage: "faktura.documents.manage" } as const;
const typeLabel: Record<FakturaDocumentType, string> = {
  quote: "Angebot",
  order: "Auftrag",
  invoice: "Rechnung",
  credit_note: "Gutschrift",
  pos_receipt: "Kassenbon",
};

export function registerDocumentRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/documents", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, typePermission.view);
    const { type } = request.query as { type?: FakturaDocumentType };
    return listDocuments(sdk, workspaceId, type && VALID_TYPES.includes(type) ? type : undefined);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, typePermission.view);
    const document = getDocument(sdk, workspaceId, id);
    if (!document) {
      reply.code(404);
      return { message: "Document not found" };
    }
    return document;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/documents", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, typePermission.manage);
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "type, customerId and at least valid lines are required" };
    }
    let document;
    try {
      document = createDraftDocument(sdk, workspaceId, userId, input);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : "Could not create document" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "document",
      entityId: document.id,
      action: "created",
      actorId: userId,
      summary: `${typeLabel[document.type]}-Entwurf angelegt`,
    });
    reply.code(201);
    return document;
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, typePermission.manage);
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "type, customerId and at least valid lines are required" };
    }
    let document;
    try {
      document = updateDraftDocument(sdk, workspaceId, id, input);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not update document" };
    }
    if (!document) {
      reply.code(404);
      return { message: "Document not found" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "document",
      entityId: document.id,
      action: "updated",
      actorId: userId,
      summary: `${typeLabel[document.type]}-Entwurf aktualisiert`,
    });
    return document;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, typePermission.manage);
    let deleted: boolean;
    try {
      deleted = deleteDraftDocument(sdk, workspaceId, id);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not delete document" };
    }
    if (!deleted) {
      reply.code(404);
      return { message: "Document not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "document", entityId: id, action: "deleted", actorId: userId, summary: "Beleg-Entwurf gelöscht" });
    reply.code(204);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id/issue", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.issue");
    let document;
    try {
      document = issueDocument(sdk, workspaceId, id, userId);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not issue document" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "document",
      entityId: document.id,
      action: "issued",
      actorId: userId,
      summary: `${typeLabel[document.type]} ausgestellt: ${document.number}`,
    });
    return document;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id/cancel", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const existing = getDocument(sdk, workspaceId, id);
    if (!existing) {
      reply.code(404);
      return { message: "Document not found" };
    }
    // A POS receipt's Storno also undoes its payment/bookings (see
    // services/pos.ts::cancelPosSale's doc comment for why that's safe to
    // do automatically only for POS sales, not ordinary invoices) - gated
    // on the lighter `faktura.pos.use` permission so terminal staff can
    // void a sale without needing full accounting-level access.
    const isPosSale = existing.type === "pos_receipt";
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, isPosSale ? "faktura.pos.use" : "faktura.documents.issue");
    let document;
    try {
      document = isPosSale ? cancelPosSale(sdk, workspaceId, userId, id) : cancelDocument(sdk, workspaceId, id);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not cancel document" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "document",
      entityId: document.id,
      action: "cancelled",
      actorId: userId,
      summary: `${typeLabel[document.type]} storniert: ${document.number}`,
    });
    return document;
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id/derived", async (request) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, typePermission.view);
    return listDerivedDocuments(sdk, workspaceId, id);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id/convert", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, typePermission.manage);
    const { targetType } = request.body as { targetType?: FakturaDocumentType };
    if (!targetType || !VALID_TYPES.includes(targetType)) {
      reply.code(400);
      return { message: "targetType is required" };
    }
    let document;
    try {
      document = convertDocument(sdk, workspaceId, userId, id, targetType);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not convert document" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "document",
      entityId: document.id,
      action: "created",
      actorId: userId,
      summary: `${typeLabel[document.type]}-Entwurf aus ${id} erzeugt`,
    });
    reply.code(201);
    return document;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:id/send-email", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, typePermission.manage);
    const { recipient } = request.body as { recipient?: string };

    const pdfBuffer = await renderAndMaybeCachePdf(sdk, workspaceId, id);
    if (!pdfBuffer) {
      reply.code(404);
      return { message: "Document not found" };
    }

    let result;
    try {
      result = await sendDocumentByEmail(sdk, workspaceId, id, pdfBuffer, recipient);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not send email" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "document",
      entityId: id,
      action: "emailed",
      actorId: userId,
      summary: `Per E-Mail versendet an ${result.sentTo}`,
    });
    return result;
  });
}
