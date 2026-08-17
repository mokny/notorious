import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listCustomers, getCustomer, createCustomer, updateCustomer, archiveCustomer, type CustomerInput } from "../services/customers.js";
import { recordAudit } from "../services/audit.js";

function parseInput(body: unknown): CustomerInput | null {
  const b = body as Partial<CustomerInput> | null;
  if (!b || typeof b.displayName !== "string" || !b.displayName.trim()) return null;
  if (b.kind !== "company" && b.kind !== "person") return null;
  if (b.taxTreatment !== "standard" && b.taxTreatment !== "reverse_charge") return null;
  return {
    kind: b.kind,
    displayName: b.displayName,
    taxTreatment: b.taxTreatment,
    vatId: b.vatId,
    country: b.country,
    defaultPaymentTermsDays: b.defaultPaymentTermsDays ?? null,
    notes: b.notes,
    contacts: b.contacts,
    addresses: b.addresses,
  };
}

export function registerCustomerRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/customers", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.view");
    const { includeArchived } = request.query as { includeArchived?: string };
    return listCustomers(sdk, workspaceId, includeArchived === "true");
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/customers/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.view");
    const customer = getCustomer(sdk, workspaceId, id);
    if (!customer) {
      reply.code(404);
      return { message: "Customer not found" };
    }
    return customer;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/customers", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "displayName, kind and taxTreatment are required" };
    }
    const customer = createCustomer(sdk, workspaceId, input);
    recordAudit(sdk, {
      workspaceId,
      entityType: "customer",
      entityId: customer.id,
      action: "created",
      actorId: userId,
      summary: `Kunde angelegt: ${customer.displayName}`,
    });
    reply.code(201);
    return customer;
  });

  app.put("/api/v1/workspaces/:workspaceId/modules/faktura/customers/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "displayName, kind and taxTreatment are required" };
    }
    const customer = updateCustomer(sdk, workspaceId, id, input);
    if (!customer) {
      reply.code(404);
      return { message: "Customer not found" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "customer",
      entityId: customer.id,
      action: "updated",
      actorId: userId,
      summary: `Kunde aktualisiert: ${customer.displayName}`,
    });
    return customer;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/customers/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.customers.manage");
    // Archived, never hard-deleted: issued documents reference customer_id
    // and must never lose their referenced master data.
    const archived = archiveCustomer(sdk, workspaceId, id);
    if (!archived) {
      reply.code(404);
      return { message: "Customer not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "customer", entityId: id, action: "archived", actorId: userId, summary: "Kunde archiviert" });
    reply.code(204);
  });
}
