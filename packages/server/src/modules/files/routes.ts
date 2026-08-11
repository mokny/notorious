import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole, requireAccess } from "../workspaces/access.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import { getBlockObjectId } from "../blocks/service.js";
import * as fileService from "./service.js";
import { badRequest } from "../../lib/httpError.js";

/** Resolves the object a file "belongs to" for scope-checking, following its blockId when it has no direct objectId of its own (e.g. images embedded in a block). Neither may be set (e.g. a workspace icon) - that's fine, it just means no object-level restriction applies. */
async function resolveFileScopeObjectId(objectId: string | null, blockId: string | null): Promise<string | undefined> {
  if (objectId) return objectId;
  if (blockId) {
    try {
      return await getBlockObjectId(blockId);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const PREVIEWABLE_MIME_PREFIXES = ["image/", "video/", "audio/", "application/pdf"];

/** Extracts a plain string value from a multipart form field, if present. */
function readTextField(field: unknown): string | null {
  if (field && typeof field === "object" && "value" in field && typeof field.value === "string") {
    return field.value;
  }
  return null;
}

export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/workspaces/:workspaceId/files", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };

    const data = await request.file();
    if (!data) throw badRequest("No file was uploaded");

    const buffer = await data.toBuffer();
    const objectId = readTextField(data.fields.objectId);
    const blockId = readTextField(data.fields.blockId);
    const kind = readTextField(data.fields.kind) === "cover" ? "cover" : "image";

    const scopeObjectId = await resolveFileScopeObjectId(objectId, blockId);
    const { actorId } = await requireAccess(request, workspaceId, "editor", { objectId: scopeObjectId });

    const asset = await fileService.saveUploadedFile({
      workspaceId,
      objectId,
      blockId,
      // Anonymous editor uploads (via a share link) are attributed to
      // whoever created that link - there's no real user to attach them to.
      uploadedBy: actorId ?? request.shareAccess!.createdBy,
      filename: data.filename,
      mimeType: data.mimetype,
      buffer,
      kind,
    });

    reply.code(201);
    return asset;
  });

  app.get("/api/v1/objects/:objectId/files", async (request) => {
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    return fileService.listFilesForObject(objectId);
  });

  app.get("/api/v1/files/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { asset, storagePath } = await fileService.getFile(id);
    const scopeObjectId = await resolveFileScopeObjectId(asset.objectId, asset.blockId);
    await requireAccess(request, asset.workspaceId, "viewer", { objectId: scopeObjectId });

    const fullPath = fileService.absoluteStoragePath(storagePath);
    const isPreviewable = PREVIEWABLE_MIME_PREFIXES.some((prefix) => asset.mimeType.startsWith(prefix));

    reply.header("Content-Type", asset.mimeType);
    reply.header(
      "Content-Disposition",
      `${isPreviewable ? "inline" : "attachment"}; filename="${asset.filename.replace(/[^\w.-]+/g, "_")}"`,
    );
    return reply.send(fs.createReadStream(fullPath));
  });

  app.delete("/api/v1/files/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const { asset } = await fileService.getFile(id);
    await requireWorkspaceRole(asset.workspaceId, user.id, "editor");
    await fileService.deleteFile(id);
    reply.code(204);
  });
}
