import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import {
  listOverdueInvoices,
  listDunningLetters,
  listDunningLettersForInvoice,
  getDunningLetter,
  createDunningDraft,
  deleteDunningDraft,
  markDunningLetterSent,
} from "../services/dunning.js";
import { renderAndMaybeCacheDunningPdf } from "./dunningPdf.js";
import { sendDunningLetterByEmail } from "../services/email.js";
import { recordAudit } from "../services/audit.js";

export function registerDunningRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/dunning/overdue", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");
    return listOverdueInvoices(sdk, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/dunning-letters", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");
    return listDunningLetters(sdk, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:invoiceId/dunning-letters", async (request) => {
    const { workspaceId, invoiceId } = request.params as { workspaceId: string; invoiceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");
    return listDunningLettersForInvoice(sdk, workspaceId, invoiceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/dunning-letters/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");
    const letter = getDunningLetter(sdk, workspaceId, id);
    if (!letter) {
      reply.code(404);
      return { message: "Dunning letter not found" };
    }
    return letter;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:invoiceId/dunning-letters", async (request, reply) => {
    const { workspaceId, invoiceId } = request.params as { workspaceId: string; invoiceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.issue");
    const { level } = request.body as { level?: number };
    if (level !== 1 && level !== 2 && level !== 3) {
      reply.code(400);
      return { message: "level must be 1, 2 or 3" };
    }
    let letter;
    try {
      letter = createDunningDraft(sdk, workspaceId, userId, invoiceId, level);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not create dunning letter" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "dunning_letter",
      entityId: letter.id,
      action: "created",
      actorId: userId,
      summary: `Mahnung Stufe ${level} vorbereitet für Rechnung ${invoiceId}`,
    });
    reply.code(201);
    return letter;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/dunning-letters/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.issue");
    let deleted: boolean;
    try {
      deleted = deleteDunningDraft(sdk, workspaceId, id);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not delete dunning letter" };
    }
    if (!deleted) {
      reply.code(404);
      return { message: "Dunning letter not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "dunning_letter", entityId: id, action: "deleted", actorId: userId, summary: "Mahnungs-Entwurf gelöscht" });
    reply.code(204);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/dunning-letters/:id/send", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.issue");
    const { recipient } = request.body as { recipient?: string };

    let letter;
    try {
      letter = markDunningLetterSent(sdk, workspaceId, id);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not send dunning letter" };
    }

    const pdfBuffer = await renderAndMaybeCacheDunningPdf(sdk, workspaceId, id);
    if (!pdfBuffer) {
      reply.code(404);
      return { message: "Dunning letter not found" };
    }

    let result;
    try {
      result = await sendDunningLetterByEmail(sdk, workspaceId, id, pdfBuffer, recipient);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not send email" };
    }

    recordAudit(sdk, {
      workspaceId,
      entityType: "dunning_letter",
      entityId: letter.id,
      action: "sent",
      actorId: userId,
      summary: `Mahnung ${letter.number} versendet an ${result.sentTo}`,
    });
    return { letter, ...result };
  });
}
