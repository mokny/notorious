import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listUnits, getUnit, createUnit, updateUnit, archiveUnit, type UnitInput } from "../services/units.js";

function parseInput(body: unknown): UnitInput | null {
  const b = body as Partial<UnitInput> | null;
  if (!b || typeof b.propertyId !== "string" || !b.propertyId) return null;
  if (typeof b.label !== "string" || !b.label.trim()) return null;
  if (typeof b.sizeSqm !== "number" || !(b.sizeSqm > 0)) return null;
  return { propertyId: b.propertyId, label: b.label, floor: b.floor, sizeSqm: b.sizeSqm, rooms: b.rooms ?? null, heatingType: b.heatingType, notes: b.notes };
}

export function registerUnitRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/units", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { propertyId, includeArchived } = request.query as { propertyId?: string; includeArchived?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.view");
    return listUnits(sdk, workspaceId, propertyId, includeArchived === "true");
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/units/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.view");
    const unit = getUnit(sdk, workspaceId, id);
    if (!unit) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    return unit;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/units", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "propertyId, label and sizeSqm are required" };
    }
    reply.code(201);
    return createUnit(sdk, workspaceId, input);
  });

  app.patch("/api/v1/workspaces/:workspaceId/modules/vermieter/units/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const updated = updateUnit(sdk, workspaceId, id, (request.body as Partial<UnitInput>) ?? {});
    if (!updated) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    return updated;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/vermieter/units/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const archived = archiveUnit(sdk, workspaceId, id);
    if (!archived) {
      reply.code(404);
      return { message: "Unit not found" };
    }
    reply.code(204);
  });
}
