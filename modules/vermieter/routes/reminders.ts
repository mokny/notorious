import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { findLeasesEndingSoon, findStatementDeadlinesApproaching, findMeterReadingsDue } from "../services/reminders.js";

/**
 * Manual "check now" endpoint - see services/reminders.ts's doc comment on
 * why this isn't wired into a background scheduler (no such hook exists in
 * the module SDK). A future web UI can poll this on page load / dashboard
 * mount.
 */
export function registerReminderRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/reminders/check", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.leases.view");
    return {
      leasesEndingSoon: findLeasesEndingSoon(sdk, workspaceId),
      statementDeadlinesApproaching: findStatementDeadlinesApproaching(sdk, workspaceId),
      meterReadingsDue: findMeterReadingsDue(sdk, workspaceId),
    };
  });
}
