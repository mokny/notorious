import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { resetVermieterData, resetReceiptsScope, resetStatementsScope, resetLeasesScope, resetPropertiesScope } from "../services/reset.js";

// Must match the phrase a future web UI's reset dialog requires the user to
// type - see modules/faktura/routes/reset.ts's identical precedent.
export const RESET_CONFIRMATION_PHRASE = "ZURÜCKSETZEN";

// Item 7 of this pass's brief: four additional, independently-triggerable
// "danger zone" scoped resets, each gated by its OWN confirmation phrase
// (distinct strings so a user can't accidentally confirm the wrong scope by
// muscle memory) - separate from RESET_CONFIRMATION_PHRASE above, which
// keeps backing the existing whole-module reset. All four use the
// `vermieter.settings.manage` permission, same as the whole-module reset -
// these are all equally "destructive settings actions", so there's no
// reason to introduce a finer-grained permission just for this.
export const RESET_RECEIPTS_CONFIRMATION_PHRASE = "BELEGE LÖSCHEN";
export const RESET_STATEMENTS_CONFIRMATION_PHRASE = "ABRECHNUNGEN LÖSCHEN";
export const RESET_LEASES_CONFIRMATION_PHRASE = "MIETVERTRÄGE LÖSCHEN";
export const RESET_PROPERTIES_CONFIRMATION_PHRASE = "IMMOBILIEN LÖSCHEN";

function checkPhrase(reply: { code: (n: number) => void }, body: unknown, expected: string): boolean {
  const { confirmationText } = (body as { confirmationText?: string } | null) ?? {};
  if (confirmationText !== expected) {
    reply.code(400);
    return false;
  }
  return true;
}

export function registerResetRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/reset", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    if (!checkPhrase(reply, request.body, RESET_CONFIRMATION_PHRASE)) {
      return { message: `confirmationText must exactly equal "${RESET_CONFIRMATION_PHRASE}"` };
    }
    resetVermieterData(sdk, workspaceId, { keepLandlordProfile: true });
    await sdk.storage.deleteSubpath(`vermieter/${workspaceId}`);
    reply.code(200);
    return { ok: true };
  });

  // Belege: vermieter_receipts + vermieter_receipt_documents, plus every
  // stored document/photo file under this workspace's receipts subpath
  // (covers both the new per-document storage layout and any pre-migration
  // single-photo paths, which lived under the same subpath prefix).
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/reset/receipts", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    if (!checkPhrase(reply, request.body, RESET_RECEIPTS_CONFIRMATION_PHRASE)) {
      return { message: `confirmationText must exactly equal "${RESET_RECEIPTS_CONFIRMATION_PHRASE}"` };
    }
    resetReceiptsScope(sdk, workspaceId);
    await sdk.storage.deleteSubpath(`vermieter/${workspaceId}/receipts`);
    reply.code(200);
    return { ok: true };
  });

  // Abrechnungen: vermieter_statements + lines + tenant_summaries, plus any
  // cached final-statement PDFs under this workspace's statements subpath.
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/reset/statements", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    if (!checkPhrase(reply, request.body, RESET_STATEMENTS_CONFIRMATION_PHRASE)) {
      return { message: `confirmationText must exactly equal "${RESET_STATEMENTS_CONFIRMATION_PHRASE}"` };
    }
    resetStatementsScope(sdk, workspaceId);
    await sdk.storage.deleteSubpath(`vermieter/${workspaceId}/statements`);
    reply.code(200);
    return { ok: true };
  });

  // Mietverträge, Mieter & Zahlungen: leases, lease-tenant links, rent-change
  // history, rent payments, tenants. No stored files under this scope.
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/reset/leases", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    if (!checkPhrase(reply, request.body, RESET_LEASES_CONFIRMATION_PHRASE)) {
      return { message: `confirmationText must exactly equal "${RESET_LEASES_CONFIRMATION_PHRASE}"` };
    }
    resetLeasesScope(sdk, workspaceId);
    reply.code(200);
    return { ok: true };
  });

  // Immobilien & Einheiten: the broadest scope - deleting a property orphans
  // everything that references its units/circuits, so this transitively
  // resets receipts, statements, AND leases/tenants/payments too (see
  // services/reset.ts::resetPropertiesScope's doc comment), then the
  // property/unit/meter/cost-circuit/reserve tables themselves. Cleans up
  // BOTH the receipts and statements storage subpaths accordingly.
  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/reset/properties", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.settings.manage");
    if (!checkPhrase(reply, request.body, RESET_PROPERTIES_CONFIRMATION_PHRASE)) {
      return { message: `confirmationText must exactly equal "${RESET_PROPERTIES_CONFIRMATION_PHRASE}"` };
    }
    resetPropertiesScope(sdk, workspaceId);
    await sdk.storage.deleteSubpath(`vermieter/${workspaceId}/receipts`);
    await sdk.storage.deleteSubpath(`vermieter/${workspaceId}/statements`);
    reply.code(200);
    return { ok: true };
  });
}
