import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listTenants, getTenant, createTenant, updateTenant, type TenantInput } from "../services/tenants.js";

function parseInput(body: unknown): TenantInput | null {
  const b = body as Partial<TenantInput> | null;
  if (!b || typeof b.name !== "string" || !b.name.trim()) return null;
  return { name: b.name, email: b.email, phone: b.phone, notes: b.notes };
}

export function registerTenantRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/tenants", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.tenants.view");
    return listTenants(sdk, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/tenants/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.tenants.view");
    const tenant = getTenant(sdk, workspaceId, id);
    if (!tenant) {
      reply.code(404);
      return { message: "Tenant not found" };
    }
    return tenant;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/tenants", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.tenants.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "name is required" };
    }
    reply.code(201);
    return createTenant(sdk, workspaceId, input);
  });

  app.patch("/api/v1/workspaces/:workspaceId/modules/vermieter/tenants/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.tenants.manage");
    const updated = updateTenant(sdk, workspaceId, id, (request.body as Partial<TenantInput>) ?? {});
    if (!updated) {
      reply.code(404);
      return { message: "Tenant not found" };
    }
    return updated;
  });
}
