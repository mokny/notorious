import type { FastifyInstance } from "fastify";
import { shareIntakeFieldsSchema, shareCommitSchema } from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireAccess, resolveActor } from "../workspaces/access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import * as shareTargetService from "./service.js";
import type { IncomingSharedFile } from "./service.js";

export async function registerShareTargetRoutes(app: FastifyInstance): Promise<void> {
  // Hit directly by the Android OS share sheet, per the `share_target` manifest entry - a real
  // top-level browser POST navigation, not a fetch call, so responses must be redirects rather
  // than JSON, and an expired session can't just 401 - there's no client JS around to catch it.
  app.post("/api/v1/share-target/intake", async (request, reply) => {
    if (!request.user) {
      return reply.redirect("/login");
    }

    const fields: { url?: string; title?: string; text?: string } = {};
    const files: IncomingSharedFile[] = [];

    for await (const part of request.parts()) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        if (buffer.length > 0) files.push({ filename: part.filename, mimeType: part.mimetype, buffer });
      } else if (part.fieldname === "url" || part.fieldname === "title" || part.fieldname === "text") {
        fields[part.fieldname] = String(part.value);
      }
    }

    const parsedFields = shareIntakeFieldsSchema.parse(fields);
    const { id } = await shareTargetService.createInboxItemFromShare(request.user.id, parsedFields, files);

    return reply.redirect(`/share-target?inboxId=${id}`, 303);
  });

  // Used by the bookmarklet path: a plain client-side JSON POST once ShareTargetPage.tsx has
  // read `url`/`title`/`text` off its own query string, made after the page has already loaded
  // authenticated (RequireAuth already guards this route client-side).
  app.post("/api/v1/share-target/intake-json", async (request) => {
    const user = requireUser(request);
    const fields = shareIntakeFieldsSchema.parse(request.body);
    return shareTargetService.createInboxItemFromShare(user.id, fields, []);
  });

  app.get("/api/v1/share-target/inbox/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    return shareTargetService.getInboxItemForUser(user.id, id);
  });

  app.post("/api/v1/share-target/commit", async (request, reply) => {
    const user = requireUser(request);
    const input = shareCommitSchema.parse(request.body);
    const access = await requireAccess(request, input.workspaceId, "editor");
    const object = await shareTargetService.commitInboxItem(user.id, input);

    const actor = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId: input.workspaceId,
      objectId: object.id,
      actorId: actor.actorId,
      actorName: actor.actorName,
      clientId: getClientId(request),
      action: input.action.kind === "create" ? "created" : "updated",
      summary: `${user.name} shared content into "${object.title}"`,
      entity: "object",
      entityId: object.id,
      realtimeAction: input.action.kind === "create" ? "created" : "updated",
    });

    reply.code(201);
    return object;
  });
}
