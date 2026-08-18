import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { resetVermieterData } from "../services/reset.js";

// Must match the phrase a future web UI's reset dialog requires the user to
// type - see modules/faktura/routes/reset.ts's identical precedent.
export const RESET_CONFIRMATION_PHRASE = "ZURÜCKSETZEN";

export function registerResetRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/reset", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    const { confirmationText } = request.body as { confirmationText?: string };
    if (confirmationText !== RESET_CONFIRMATION_PHRASE) {
      reply.code(400);
      return { message: `confirmationText must exactly equal "${RESET_CONFIRMATION_PHRASE}"` };
    }
    resetVermieterData(sdk, workspaceId, { keepLandlordProfile: true });
    await sdk.storage.deleteSubpath(`vermieter/${workspaceId}`);
    reply.code(200);
    return { ok: true };
  });
}
