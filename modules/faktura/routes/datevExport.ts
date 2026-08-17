import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { exportBuchungsstapel } from "../services/datevExport.js";
import { recordAudit } from "../services/audit.js";

export function registerDatevExportRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/datev-export", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    const { from, to } = request.query as { from?: string; to?: string };

    const currentYear = sdk.nowIso().slice(0, 4);
    const rangeFrom = from ?? `${currentYear}-01-01`;
    const rangeTo = to ?? `${currentYear}-12-31`;

    const csv = exportBuchungsstapel(sdk, workspaceId, rangeFrom, rangeTo);
    recordAudit(sdk, {
      workspaceId,
      entityType: "datev_export",
      entityId: workspaceId,
      action: "exported",
      actorId: userId,
      summary: `DATEV-Export ${rangeFrom} bis ${rangeTo}`,
    });

    reply.header("Content-Type", "text/csv; charset=iso-8859-1");
    reply.header("Content-Disposition", `attachment; filename="EXTF_Buchungsstapel_${rangeFrom}_${rangeTo}.csv"`);
    // DATEV EXTF files are traditionally ISO-8859-1, not UTF-8 - encode
    // explicitly rather than letting Fastify send the JS string as UTF-8.
    return reply.send(Buffer.from(csv, "latin1"));
  });
}
