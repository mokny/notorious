import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { getStatement, getStatementLines, getTenantSummaries, setStatementPdfStoragePath } from "../services/statements.js";
import { getProperty } from "../services/properties.js";
import { getLandlordProfile } from "../services/landlordProfile.js";
import { getUnit } from "../services/units.js";
import { listTenantsForLease } from "../services/tenants.js";
import { renderStatementPdf, type TenantSummaryForPdf } from "../pdf/render.js";

/**
 * Renders (or, for an already-`final` statement, re-serves the cached copy
 * of) a statement's PDF - mirrors faktura/routes/documentPdf.ts's
 * generate/cache/stream pattern: a `draft` statement is always rendered
 * fresh since its inputs could still change (regenerate), a `final` one is
 * cached to `pdf_storage_path` since it's a fixed legal snapshot.
 */
async function renderAndMaybeCachePdf(sdk: ModuleSdk, workspaceId: string, statementId: string): Promise<Buffer | null> {
  const statement = getStatement(sdk, workspaceId, statementId);
  if (!statement) return null;
  const property = getProperty(sdk, workspaceId, statement.propertyId);
  if (!property) return null;
  const landlord = getLandlordProfile(sdk, workspaceId);

  if (statement.status === "final" && statement.pdfStoragePath) {
    return sdk.storage.read(statement.pdfStoragePath);
  }

  const lines = getStatementLines(sdk, statementId);
  const summaries = getTenantSummaries(sdk, statementId);
  const summariesForPdf: TenantSummaryForPdf[] = summaries.map((summary) => {
    const unit = getUnit(sdk, workspaceId, summary.unitId);
    const tenants = listTenantsForLease(sdk, summary.leaseId);
    return { ...summary, unitLabel: unit?.label ?? summary.unitId, tenantNames: tenants.map((t) => t.name) };
  });

  const buffer = await renderStatementPdf(property, landlord, statement, lines, summariesForPdf);

  if (statement.status === "final") {
    const { storagePath } = await sdk.storage.write(`vermieter/${workspaceId}/statements`, `${statementId}.pdf`, buffer);
    setStatementPdfStoragePath(sdk, workspaceId, statementId, storagePath);
  }

  return buffer;
}

export function registerStatementPdfRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/statements/:id/pdf", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.statements.view");
    const buffer = await renderAndMaybeCachePdf(sdk, workspaceId, id);
    if (!buffer) {
      reply.code(404);
      return { message: "Statement not found" };
    }
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="Nebenkostenabrechnung-${id}.pdf"`);
    return reply.send(buffer);
  });
}
