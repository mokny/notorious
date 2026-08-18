import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listStatements, getStatement, getStatementLines, getTenantSummaries, generateStatement, finalizeStatement, deleteStatement } from "../services/statements.js";

export function registerStatementRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/statements", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { propertyId } = request.query as { propertyId?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.statements.view");
    return listStatements(sdk, workspaceId, propertyId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/statements/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.statements.view");
    const statement = getStatement(sdk, workspaceId, id);
    if (!statement) {
      reply.code(404);
      return { message: "Statement not found" };
    }
    return {
      ...statement,
      lines: getStatementLines(sdk, id),
      tenantSummaries: getTenantSummaries(sdk, id),
    };
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/statements", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "vermieter.statements.generate");
    const b = request.body as { propertyId?: string; periodStart?: string; periodEnd?: string; heatingConsumptionSharePercent?: number };
    if (!b || typeof b.propertyId !== "string" || !b.propertyId) {
      reply.code(400);
      return { message: "propertyId is required" };
    }
    if (typeof b.periodStart !== "string" || typeof b.periodEnd !== "string" || b.periodStart > b.periodEnd) {
      reply.code(400);
      return { message: "periodStart and periodEnd (YYYY-MM-DD, periodStart <= periodEnd) are required" };
    }
    if (b.heatingConsumptionSharePercent != null && (b.heatingConsumptionSharePercent < 50 || b.heatingConsumptionSharePercent > 100)) {
      reply.code(400);
      return { message: "heatingConsumptionSharePercent must be between 50 and 100 (HeizkostenV §7)" };
    }
    const statement = generateStatement(sdk, workspaceId, userId, {
      propertyId: b.propertyId,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      heatingConsumptionSharePercent: b.heatingConsumptionSharePercent,
    });
    reply.code(201);
    return { ...statement, lines: getStatementLines(sdk, statement.id), tenantSummaries: getTenantSummaries(sdk, statement.id) };
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/statements/:id/finalize", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.statements.generate");
    const updated = finalizeStatement(sdk, workspaceId, id);
    if (!updated) {
      reply.code(404);
      return { message: "Statement not found" };
    }
    return updated;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/vermieter/statements/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.statements.generate");
    const statement = getStatement(sdk, workspaceId, id);
    if (!statement) {
      reply.code(404);
      return { message: "Statement not found" };
    }
    if (statement.status === "final") {
      reply.code(400);
      return { message: "A final statement cannot be deleted - it's a legal document" };
    }
    deleteStatement(sdk, workspaceId, id);
    reply.code(204);
  });
}
