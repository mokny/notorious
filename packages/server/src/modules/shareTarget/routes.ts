import type { FastifyInstance } from "fastify";
import { shareIntakeFieldsSchema, shareCommitSchema } from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireAccess, resolveActor } from "../workspaces/access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import { authenticateApiKey } from "../apiKeys/service.js";
import { unauthorized, badRequest } from "../../lib/httpError.js";
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

  // Used by the iOS Shortcut workaround (see IosShortcutSettings.tsx): iOS has no Web Share
  // Target API, so a user-installed Shortcut POSTs here directly with `Authorization: Bearer
  // <api key>` (requireUser accepts either the session cookie or an API key, see session.ts) and
  // gets JSON back instead of a redirect, since the Shortcut isn't a browser navigation.
  app.post("/api/v1/share-target/intake-multipart", async (request, reply) => {
    const user = requireUser(request);

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
    const result = await shareTargetService.createInboxItemFromShare(user.id, parsedFields, files);

    reply.code(201);
    return result;
  });

  // Used by the iOS Shortcut workaround for the *file* case specifically: Shortcuts' own "Get
  // Contents of URL" action can send a shared file as a raw POST body (WFHTTPBodyType "File"),
  // but reliably building a multipart/form-data body by hand in the shortcut's plist (as
  // /intake-multipart above expects) turned out to not be a viable path - it crashed the
  // Shortcuts app on import. Fastify has no parser for arbitrary content-types by default (a
  // shared photo/PDF could be anything), so this route gets its own encapsulated context with a
  // catch-all raw-buffer parser, scoped so it can't affect any other route's body parsing.
  // Auth is a `?apiKey=` query param rather than the usual Authorization header, since a plain
  // literal query string is the lowest-risk plist structure to hand-author - see
  // IosShortcutSettings.tsx for why that trade-off (a key in the URL, and therefore in any proxy
  // access log) was accepted here specifically.
  await app.register(async (raw) => {
    raw.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => done(null, body));

    raw.post(
      "/api/v1/share-target/intake-raw",
      { bodyLimit: 50 * 1024 * 1024 },
      async (request, reply) => {
        const { apiKey, filename, title, text, url } = request.query as {
          apiKey?: string;
          filename?: string;
          title?: string;
          text?: string;
          url?: string;
        };
        if (!apiKey) throw unauthorized();
        const user = await authenticateApiKey(apiKey);
        if (!user) throw unauthorized();

        const buffer = request.body as Buffer;
        const files: IncomingSharedFile[] = [];
        if (buffer.length > 0) {
          files.push({
            filename: filename || "shared-file",
            mimeType: request.headers["content-type"] || "application/octet-stream",
            buffer,
          });
        }

        // Surfaced straight back into the Shortcuts app's own error alert (it shows the failed
        // request's response body), since there's no other way to see what actually arrived here
        // without shell access to the prod server's logs.
        if (files.length === 0 && !url && !text) {
          throw badRequest(
            `No file body received (content-length: ${request.headers["content-length"] ?? "none"}, ` +
              `content-type: ${request.headers["content-type"] ?? "none"}, buffer bytes: ${buffer?.length ?? 0})`,
          );
        }

        const parsedFields = shareIntakeFieldsSchema.parse({ title, text, url });
        const result = await shareTargetService.createInboxItemFromShare(user.id, parsedFields, files);

        reply.code(201);
        return result;
      },
    );
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
