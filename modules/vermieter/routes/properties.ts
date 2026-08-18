import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listProperties, getProperty, createProperty, updateProperty, archiveProperty, type PropertyInput } from "../services/properties.js";

function parseInput(body: unknown): PropertyInput | null {
  const b = body as Partial<PropertyInput> | null;
  if (!b || typeof b.name !== "string" || !b.name.trim()) return null;
  if (typeof b.street !== "string" || !b.street.trim()) return null;
  if (typeof b.houseNumber !== "string" || !b.houseNumber.trim()) return null;
  if (typeof b.postalCode !== "string" || !b.postalCode.trim()) return null;
  if (typeof b.city !== "string" || !b.city.trim()) return null;
  return {
    name: b.name,
    street: b.street,
    houseNumber: b.houseNumber,
    postalCode: b.postalCode,
    city: b.city,
    country: b.country,
    purchaseDate: b.purchaseDate ?? null,
    purchasePriceCents: b.purchasePriceCents ?? null,
    buildingYear: b.buildingYear ?? null,
    landValueCents: b.landValueCents ?? null,
    notes: b.notes,
  };
}

export function registerPropertyRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/properties", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { includeArchived } = request.query as { includeArchived?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.view");
    return listProperties(sdk, workspaceId, includeArchived === "true");
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/properties/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.view");
    const property = getProperty(sdk, workspaceId, id);
    if (!property) {
      reply.code(404);
      return { message: "Property not found" };
    }
    return property;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/properties", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "name, street, houseNumber, postalCode and city are required" };
    }
    reply.code(201);
    return createProperty(sdk, workspaceId, input);
  });

  app.patch("/api/v1/workspaces/:workspaceId/modules/vermieter/properties/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const updated = updateProperty(sdk, workspaceId, id, (request.body as Partial<PropertyInput>) ?? {});
    if (!updated) {
      reply.code(404);
      return { message: "Property not found" };
    }
    return updated;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/vermieter/properties/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const archived = archiveProperty(sdk, workspaceId, id);
    if (!archived) {
      reply.code(404);
      return { message: "Property not found" };
    }
    reply.code(204);
  });
}
