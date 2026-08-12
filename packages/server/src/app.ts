import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import staticFiles from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { env } from "./env.js";
import { HttpError } from "./lib/httpError.js";
import { sessionPlugin } from "./plugins/session.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerTwoFactorRoutes } from "./modules/twoFactor/routes.js";
import { registerWebauthnRoutes } from "./modules/webauthn/routes.js";
import { registerWorkspaceRoutes } from "./modules/workspaces/routes.js";
import { registerSchemaRoutes } from "./modules/schema/routes.js";
import { registerObjectRoutes } from "./modules/objects/routes.js";
import { registerBlockRoutes } from "./modules/blocks/routes.js";
import { registerViewRoutes } from "./modules/views/routes.js";
import { registerSearchRoutes } from "./modules/search/routes.js";
import { registerFileRoutes } from "./modules/files/routes.js";
import { registerShareTargetRoutes } from "./modules/shareTarget/routes.js";
import { registerPushRoutes } from "./modules/push/routes.js";
import { registerBackupRoutes } from "./modules/backup/routes.js";
import { registerRealtimeRoutes } from "./modules/realtime/routes.js";
import { registerApiKeyRoutes } from "./modules/apiKeys/routes.js";
import { registerLinkPreviewRoutes } from "./modules/linkPreview/routes.js";
import { registerLinkOutRoutes } from "./modules/linkOut/routes.js";
import { registerSystemRoutes } from "./modules/system/routes.js";
import { registerShareLinkRoutes } from "./modules/shareLinks/routes.js";
import { registerScriptRoutes } from "./modules/scripting/routes.js";
import { registerWebhookRoutes } from "./modules/webhooks/routes.js";
import { registerAiRoutes } from "./modules/ai/routes.js";
import { registerMcpRoutes } from "./modules/mcp/routes.js";
import { registerTemplateRoutes } from "./modules/templates/routes.js";
import { registerPresenceRoutes } from "./modules/presence/routes.js";
import { registerUserRoutes } from "./modules/users/routes.js";
import { registerCommentRoutes } from "./modules/comments/routes.js";
import { registerNotificationRoutes } from "./modules/notifications/routes.js";
import { registerChatRoutes } from "./modules/chat/routes.js";
import { registerCallRoutes } from "./modules/calls/routes.js";
import { registerFeedRoutes } from "./modules/feeds/routes.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const WEB_DIST_DIR = path.join(PACKAGE_ROOT, "packages/web/dist");
const { version: PACKAGE_VERSION } = JSON.parse(
  fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { version: string };

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Notorious API",
        description:
          "REST + WebSocket API for the Notorious notes/knowledge-base app. " +
          "Every action available in the web UI is available here too. Authenticate with either " +
          "the session cookie (browser) or an `Authorization: Bearer <api-key>` header (see " +
          "/api/v1/api-keys).",
        version: PACKAGE_VERSION,
      },
      servers: [{ url: "/" }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  await app.register(cors, {
    origin: env.isProduction ? true : env.webOrigin,
    credentials: true,
  });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } });
  await app.register(websocket);
  await app.register(sessionPlugin);
  // `global: false` - this only throttles routes that opt in via their own
  // `config: { rateLimit: {...} }` (currently just comment creation, the
  // app's one spam-prone, low-friction-to-abuse write) rather than every
  // route in the app. Keyed by session user id when logged in, falling back
  // to IP for anonymous share-link visitors - `request.user` isn't set yet
  // this early in the plugin chain, so the key generator reads it lazily per
  // request rather than at registration time.
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => request.user?.id ?? request.ip,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({ message: error.message });
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({ message: "Validation failed", issues: error.issues });
      return;
    }
    app.log.error(error);
    reply.code(500).send({ message: "Internal server error" });
  });

  await registerAuthRoutes(app);
  await registerTwoFactorRoutes(app);
  await registerWebauthnRoutes(app);
  await registerWorkspaceRoutes(app);
  await registerSchemaRoutes(app);
  await registerObjectRoutes(app);
  await registerBlockRoutes(app);
  await registerViewRoutes(app);
  await registerSearchRoutes(app);
  await registerFileRoutes(app);
  await registerShareTargetRoutes(app);
  await registerPushRoutes(app);
  await registerBackupRoutes(app);
  await registerRealtimeRoutes(app);
  await registerApiKeyRoutes(app);
  await registerLinkPreviewRoutes(app);
  await registerLinkOutRoutes(app);
  await registerSystemRoutes(app);
  await registerShareLinkRoutes(app);
  await registerScriptRoutes(app);
  await registerWebhookRoutes(app);
  await registerAiRoutes(app);
  await registerMcpRoutes(app);
  await registerTemplateRoutes(app);
  await registerPresenceRoutes(app);
  await registerUserRoutes(app);
  await registerCommentRoutes(app);
  await registerNotificationRoutes(app);
  await registerChatRoutes(app);
  await registerCallRoutes(app);
  await registerFeedRoutes(app);

  app.get("/api/v1/health", async () => ({ status: "ok", version: PACKAGE_VERSION }));

  // In production the server also serves the built frontend (single deployable
  // unit); in dev, Vite's own dev server handles the frontend on another port.
  if (env.isProduction) {
    await app.register(staticFiles, { root: WEB_DIST_DIR });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ message: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
