import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/session.js";
import { badRequest } from "../../lib/httpError.js";
import { fetchLinkPreview } from "./service.js";

export async function registerLinkPreviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/link-preview", async (request) => {
    requireUser(request);
    const { url } = request.query as { url?: string };
    if (!url) throw badRequest("url is required");
    return fetchLinkPreview(url);
  });
}
