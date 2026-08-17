import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listSuppliers, getSupplier, createSupplier, updateSupplier, archiveSupplier, type SupplierInput } from "../services/suppliers.js";
import { recordAudit } from "../services/audit.js";

function parseInput(body: unknown): SupplierInput | null {
  const b = body as Partial<SupplierInput> | null;
  if (!b || typeof b.name !== "string" || !b.name.trim()) return null;
  return { ...b, name: b.name };
}

export function registerSupplierRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/suppliers", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.suppliers.view");
    const { includeArchived } = request.query as { includeArchived?: string };
    return listSuppliers(sdk, workspaceId, includeArchived === "true");
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/suppliers/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.suppliers.view");
    const supplier = getSupplier(sdk, workspaceId, id);
    if (!supplier) {
      reply.code(404);
      return { message: "Supplier not found" };
    }
    return supplier;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/suppliers", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.suppliers.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "name is required" };
    }
    const supplier = createSupplier(sdk, workspaceId, input);
    recordAudit(sdk, { workspaceId, entityType: "supplier", entityId: supplier.id, action: "created", actorId: userId, summary: `Lieferant angelegt: ${supplier.name}` });
    reply.code(201);
    return supplier;
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/faktura/suppliers/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.suppliers.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "name is required" };
    }
    const supplier = updateSupplier(sdk, workspaceId, id, input);
    if (!supplier) {
      reply.code(404);
      return { message: "Supplier not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "supplier", entityId: supplier.id, action: "updated", actorId: userId, summary: `Lieferant aktualisiert: ${supplier.name}` });
    return supplier;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/suppliers/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.suppliers.manage");
    const archived = archiveSupplier(sdk, workspaceId, id);
    if (!archived) {
      reply.code(404);
      return { message: "Supplier not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "supplier", entityId: id, action: "archived", actorId: userId, summary: "Lieferant archiviert" });
    reply.code(204);
  });
}
