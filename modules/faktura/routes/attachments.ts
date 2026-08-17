import type { FastifyInstance } from "fastify";
// Pulls in @fastify/multipart's `FastifyRequest.file()` ambient type
// augmentation for this module's own tsc program (modules/tsconfig.json is
// a separate compilation from packages/server's, so the augmentation isn't
// automatically visible here without an explicit reference).
import type {} from "@fastify/multipart";
import type { ModuleSdk } from "../manifest.js";
import { listAttachments, getAttachment, createAttachment, deleteAttachment } from "../services/attachments.js";
import { recordAudit } from "../services/audit.js";
import type { FakturaAttachmentEntityType } from "../db/types.js";

const VALID_ENTITY_TYPES: FakturaAttachmentEntityType[] = ["customer", "order"];

function readTextField(field: unknown): string | null {
  if (field && typeof field === "object" && "value" in field && typeof field.value === "string") {
    return field.value;
  }
  return null;
}

export function registerAttachmentRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/attachments", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { entityType, entityId } = request.query as { entityType?: string; entityId?: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.view");
    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as FakturaAttachmentEntityType) || !entityId) {
      reply.code(400);
      return { message: "entityType and entityId are required" };
    }
    return listAttachments(sdk, workspaceId, entityType as FakturaAttachmentEntityType, entityId);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/attachments", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.manage");

    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { message: "No file was uploaded" };
    }
    const entityType = readTextField(data.fields.entityType);
    const entityId = readTextField(data.fields.entityId);
    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as FakturaAttachmentEntityType) || !entityId) {
      reply.code(400);
      return { message: "entityType and entityId form fields are required" };
    }

    const buffer = await data.toBuffer();
    const attachment = await createAttachment(sdk, workspaceId, {
      entityType: entityType as FakturaAttachmentEntityType,
      entityId,
      filename: data.filename,
      mimeType: data.mimetype,
      buffer,
      uploadedBy: userId,
    });
    recordAudit(sdk, {
      workspaceId,
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      action: "attachment_added",
      actorId: userId,
      summary: `Datei angehängt: ${attachment.filename}`,
    });
    reply.code(201);
    return attachment;
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/attachments/:id/download", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.view");
    const attachment = getAttachment(sdk, workspaceId, id);
    if (!attachment) {
      reply.code(404);
      return { message: "Attachment not found" };
    }
    const buffer = await sdk.storage.read(attachment.storage_path);
    reply.header("Content-Type", attachment.mime_type || "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename="${attachment.filename}"`);
    return reply.send(buffer);
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/attachments/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.manage");
    const deleted = await deleteAttachment(sdk, workspaceId, id);
    if (!deleted) {
      reply.code(404);
      return { message: "Attachment not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "attachment", entityId: id, action: "deleted", actorId: userId, summary: "Anhang gelöscht" });
    reply.code(204);
  });
}
