import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { resolveCostCategory } from "../services/customCostCategories.js";
import type { VermieterBillingMode } from "../db/types.js";
import {
  listCircuitCategorySettings,
  setCircuitCategorySetting,
  clearCircuitCategorySetting,
  listExternalCostAllocations,
  getExternalCostAllocation,
  createExternalCostAllocation,
  updateExternalCostAllocation,
  deleteExternalCostAllocation,
  type ExternalCostAllocationInput,
} from "../services/externalBilling.js";
import { getCostCircuit } from "../services/costCircuits.js";

const VALID_BILLING_MODES: VermieterBillingMode[] = ["calculated", "external_provider"];

function parseAllocationInput(body: unknown): ExternalCostAllocationInput | null {
  const b = body as Partial<ExternalCostAllocationInput> | null;
  if (!b || typeof b.costCategoryKey !== "string" || !b.costCategoryKey) return null;
  if (typeof b.unitId !== "string" || !b.unitId) return null;
  if (typeof b.periodStart !== "string" || !b.periodStart) return null;
  if (typeof b.periodEnd !== "string" || !b.periodEnd || b.periodEnd < b.periodStart) return null;
  if (typeof b.amountCents !== "number" || !Number.isInteger(b.amountCents) || b.amountCents < 0) return null;
  return {
    costCategoryKey: b.costCategoryKey,
    unitId: b.unitId,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    amountCents: b.amountCents,
    providerReference: b.providerReference ?? null,
  };
}

/**
 * External metering-service billing (Techem, ista, Minol, ...) - see
 * services/externalBilling.ts's doc comment. Both sub-resources hang off a
 * cost circuit (not nested under a property in the URL, same flat style
 * routes/leases.ts already uses for .../leases/:id/rent-changes) since a
 * circuit id alone is already enough to resolve everything.
 *
 * Permissions: category-settings reuses vermieter.properties.view/.manage -
 * it's a circuit/category configuration flag, same reasoning
 * routes/costCircuits.ts already applies to the circuit itself.
 * external-allocations reuses vermieter.receipts.view/.manage instead - it's
 * landlord-entered cost data for a specific period, much closer in kind to a
 * receipt (an actual transcribed euro amount) than to circuit/property
 * configuration.
 */
export function registerExternalBillingRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  const circuitBase = "/api/v1/workspaces/:workspaceId/modules/vermieter/cost-circuits/:id";

  app.get(`${circuitBase}/category-settings`, async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.view");
    if (!getCostCircuit(sdk, workspaceId, id)) {
      reply.code(404);
      return { message: "Cost circuit not found" };
    }
    return listCircuitCategorySettings(sdk, workspaceId, id);
  });

  app.put(`${circuitBase}/category-settings/:categoryKey`, async (request, reply) => {
    const { workspaceId, id, categoryKey } = request.params as { workspaceId: string; id: string; categoryKey: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    if (!getCostCircuit(sdk, workspaceId, id)) {
      reply.code(404);
      return { message: "Cost circuit not found" };
    }
    if (!resolveCostCategory(sdk, workspaceId, categoryKey)) {
      reply.code(400);
      return { message: "Unknown cost category" };
    }
    const b = request.body as { billingMode?: string; providerName?: string | null } | null;
    if (!b || typeof b.billingMode !== "string" || !VALID_BILLING_MODES.includes(b.billingMode as VermieterBillingMode)) {
      reply.code(400);
      return { message: "billingMode must be 'calculated' or 'external_provider'" };
    }
    return setCircuitCategorySetting(sdk, workspaceId, id, categoryKey, {
      billingMode: b.billingMode as VermieterBillingMode,
      providerName: b.providerName,
    });
  });

  app.delete(`${circuitBase}/category-settings/:categoryKey`, async (request, reply) => {
    const { workspaceId, id, categoryKey } = request.params as { workspaceId: string; id: string; categoryKey: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.properties.manage");
    const cleared = clearCircuitCategorySetting(sdk, workspaceId, id, categoryKey);
    if (!cleared) {
      reply.code(404);
      return { message: "No explicit category setting to clear (already 'calculated')" };
    }
    reply.code(204);
  });

  app.get(`${circuitBase}/external-allocations`, async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { categoryKey, periodStart, periodEnd } = request.query as { categoryKey?: string; periodStart?: string; periodEnd?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    if (!getCostCircuit(sdk, workspaceId, id)) {
      reply.code(404);
      return { message: "Cost circuit not found" };
    }
    return listExternalCostAllocations(sdk, workspaceId, id, { costCategoryKey: categoryKey, periodStart, periodEnd });
  });

  app.post(`${circuitBase}/external-allocations`, async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    if (!getCostCircuit(sdk, workspaceId, id)) {
      reply.code(404);
      return { message: "Cost circuit not found" };
    }
    const input = parseAllocationInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "costCategoryKey, unitId, periodStart, periodEnd (>= periodStart) and amountCents are required" };
    }
    reply.code(201);
    return createExternalCostAllocation(sdk, workspaceId, id, input);
  });

  app.get(`${circuitBase}/external-allocations/:allocationId`, async (request, reply) => {
    const { workspaceId, allocationId } = request.params as { workspaceId: string; id: string; allocationId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.view");
    const allocation = getExternalCostAllocation(sdk, workspaceId, allocationId);
    if (!allocation) {
      reply.code(404);
      return { message: "External cost allocation not found" };
    }
    return allocation;
  });

  app.patch(`${circuitBase}/external-allocations/:allocationId`, async (request, reply) => {
    const { workspaceId, allocationId } = request.params as { workspaceId: string; id: string; allocationId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    const updated = updateExternalCostAllocation(sdk, workspaceId, allocationId, (request.body as Partial<ExternalCostAllocationInput>) ?? {});
    if (!updated) {
      reply.code(404);
      return { message: "External cost allocation not found" };
    }
    return updated;
  });

  app.delete(`${circuitBase}/external-allocations/:allocationId`, async (request, reply) => {
    const { workspaceId, allocationId } = request.params as { workspaceId: string; id: string; allocationId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.receipts.manage");
    const deleted = deleteExternalCostAllocation(sdk, workspaceId, allocationId);
    if (!deleted) {
      reply.code(404);
      return { message: "External cost allocation not found" };
    }
    reply.code(204);
  });
}
