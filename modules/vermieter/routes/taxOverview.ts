import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { computeTaxOverview } from "../services/taxOverview.js";
import { requireProperty } from "../services/properties.js";
import { renderTaxOverviewPdf, renderTaxOverviewCsv } from "../pdf/taxOverviewPdf.js";
import { getProperty } from "../services/properties.js";
import { buildCostCategoryLabelMap } from "../services/customCostCategories.js";

export function registerTaxOverviewRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/properties/:propertyId/tax-overview", async (request, reply) => {
    const { workspaceId, propertyId } = request.params as { workspaceId: string; propertyId: string };
    const { year } = request.query as { year?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.tax.view");
    const parsedYear = year ? Number(year) : new Date().getFullYear();
    if (!Number.isInteger(parsedYear)) {
      reply.code(400);
      return { message: "year must be an integer" };
    }
    try {
      return computeTaxOverview(sdk, workspaceId, propertyId, parsedYear);
    } catch {
      reply.code(404);
      return { message: "Property not found" };
    }
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/properties/:propertyId/tax-overview/pdf", async (request, reply) => {
    const { workspaceId, propertyId } = request.params as { workspaceId: string; propertyId: string };
    const { year } = request.query as { year?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.tax.view");
    const parsedYear = year ? Number(year) : new Date().getFullYear();
    const property = getProperty(sdk, workspaceId, propertyId);
    if (!property) {
      reply.code(404);
      return { message: "Property not found" };
    }
    const overview = computeTaxOverview(sdk, workspaceId, propertyId, parsedYear);
    const categoryLabels = buildCostCategoryLabelMap(sdk, workspaceId);
    const buffer = await renderTaxOverviewPdf(property, overview, categoryLabels);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="Steuerübersicht-${property.name}-${parsedYear}.pdf"`);
    return reply.send(buffer);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/properties/:propertyId/tax-overview/csv", async (request, reply) => {
    const { workspaceId, propertyId } = request.params as { workspaceId: string; propertyId: string };
    const { year } = request.query as { year?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.tax.view");
    const parsedYear = year ? Number(year) : new Date().getFullYear();
    requireProperty(sdk, workspaceId, propertyId);
    const overview = computeTaxOverview(sdk, workspaceId, propertyId, parsedYear);
    const categoryLabels = buildCostCategoryLabelMap(sdk, workspaceId);
    const csv = renderTaxOverviewCsv(overview, categoryLabels);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="steuerübersicht-${parsedYear}.csv"`);
    return reply.send(csv);
  });
}
