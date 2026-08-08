import type { FastifyInstance } from "fastify";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Unauthenticated on purpose - this only ever redirects to a URL that was
 * already visible in rendered content (rich text, bookmark blocks, url
 * properties), including on anonymous share-link pages. It holds no
 * workspace data of its own, so there's nothing to gate behind a session.
 */
export async function registerLinkOutRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { url?: string } }>("/api/v1/link-out", async (request, reply) => {
    const target = request.query.url;
    if (!target) return reply.code(400).send({ error: "Missing url" });

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return reply.code(400).send({ error: "Invalid url" });
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return reply.code(400).send({ error: "Unsupported protocol" });

    return reply.redirect(parsed.toString(), 302);
  });
}
