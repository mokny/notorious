import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { resetFakturaData } from "../services/reset.js";
import { recordAudit } from "../services/audit.js";

// Must match the phrase shown/required in web/pages/CompanySettingsPage.tsx's
// reset dialog - the double confirmation (modal + typed phrase) is the
// whole point, so client and server must agree on the exact text.
export const RESET_CONFIRMATION_PHRASE = "ZURÜCKSETZEN";

export function registerResetRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/reset", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    // Full-data-wipe, so requires the same permission as company settings
    // (effectively workspace-owner-level), not any lesser Faktura permission.
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.settings.manage");
    const { confirmationText } = request.body as { confirmationText?: string };
    if (confirmationText !== RESET_CONFIRMATION_PHRASE) {
      reply.code(400);
      return { message: `confirmationText must exactly equal "${RESET_CONFIRMATION_PHRASE}"` };
    }

    // Company settings (legal name, tax config, chart-of-accounts choice,
    // numbering prefixes, test mode) are deliberately kept - only business/
    // transactional data is wiped, see services/reset.ts's doc comment.
    resetFakturaData(sdk, workspaceId, { keepCompanySettings: true });
    await sdk.storage.deleteSubpath(`faktura/${workspaceId}`);

    // Written *after* the reset (which also clears the audit log itself),
    // so there's still exactly one trace of the reset having happened.
    recordAudit(sdk, {
      workspaceId,
      entityType: "faktura",
      entityId: workspaceId,
      action: "reset",
      actorId: userId,
      summary: "Faktura-Daten vollständig zurückgesetzt",
    });

    reply.code(200);
    return { ok: true };
  });
}
