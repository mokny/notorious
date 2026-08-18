import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import {
  listCostCircuits,
  getCostCircuit,
  createCostCircuit,
  renameCostCircuit,
  setCostCircuitUnits,
  deleteCostCircuit,
} from "../services/costCircuits.js";

/**
 * Abrechnungskreise (cost circuits) - a property sub-resource, reusing the
 * existing `vermieter.properties.view`/`.manage` permissions rather than
 * introducing a new one: a circuit only ever exists in the context of one
 * property and has no independent access story (same reasoning
 * routes/units.ts already applies to units).
 */
export function registerCostCircuitRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  const base = "/api/v1/workspaces/:workspaceId/modules/vermieter/properties/:propertyId/cost-circuits";

  app.get(base, async (request) => {
    const { workspaceId, propertyId } = request.params as { workspaceId: string; propertyId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.view");
    return listCostCircuits(sdk, workspaceId, propertyId);
  });

  app.post(base, async (request, reply) => {
    const { workspaceId, propertyId } = request.params as { workspaceId: string; propertyId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const b = request.body as { name?: string } | null;
    if (!b || typeof b.name !== "string" || !b.name.trim()) {
      reply.code(400);
      return { message: "name is required" };
    }
    reply.code(201);
    return createCostCircuit(sdk, workspaceId, propertyId, b.name);
  });

  app.patch(`${base}/:id`, async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; propertyId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const b = request.body as { name?: string } | null;
    if (!b || typeof b.name !== "string" || !b.name.trim()) {
      reply.code(400);
      return { message: "name is required" };
    }
    const updated = renameCostCircuit(sdk, workspaceId, id, b.name);
    if (!updated) {
      reply.code(404);
      return { message: "Cost circuit not found" };
    }
    return updated;
  });

  app.put(`${base}/:id/units`, async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; propertyId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const b = request.body as { unitIds?: unknown } | null;
    if (!b || !Array.isArray(b.unitIds) || !b.unitIds.every((u) => typeof u === "string")) {
      reply.code(400);
      return { message: "unitIds (string[]) is required" };
    }
    const existing = getCostCircuit(sdk, workspaceId, id);
    if (!existing) {
      reply.code(404);
      return { message: "Cost circuit not found" };
    }
    if (existing.isDefault) {
      reply.code(400);
      return { message: "The default circuit's membership always mirrors the property's unit list and can't be edited directly" };
    }
    return setCostCircuitUnits(sdk, workspaceId, id, b.unitIds as string[]);
  });

  app.delete(`${base}/:id`, async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; propertyId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const result = deleteCostCircuit(sdk, workspaceId, id);
    if (!result.deleted) {
      reply.code(result.reason === "is_default" ? 400 : 404);
      return { message: result.reason === "is_default" ? "The default circuit can't be deleted" : "Cost circuit not found" };
    }
    reply.code(204);
  });
}
