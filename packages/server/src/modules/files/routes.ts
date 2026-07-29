import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import * as fileService from "./service.js";
import { badRequest } from "../../lib/httpError.js";

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
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");

    const data = await request.file();
    if (!data) throw badRequest("No file was uploaded");

    const buffer = await data.toBuffer();
    const objectId = readTextField(data.fields.objectId);
    const blockId = readTextField(data.fields.blockId);

    const asset = await fileService.saveUploadedFile({
      workspaceId,
      objectId,
      blockId,
      uploadedBy: user.id,
      filename: data.filename,
      mimeType: data.mimetype,
      buffer,
    });

    reply.code(201);
    return asset;
  });

  app.get("/api/v1/objects/:objectId/files", async (request) => {
    const user = requireUser(request);
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return fileService.listFilesForObject(objectId);
  });

  app.get("/api/v1/files/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const { asset, storagePath } = await fileService.getFile(id);
    await requireWorkspaceRole(asset.workspaceId, user.id, "viewer");

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
