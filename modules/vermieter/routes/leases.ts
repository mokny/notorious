import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import {
  listLeases,
  getLease,
  createLease,
  updateLease,
  changeLeaseRent,
  listRentChanges,
  type LeaseInput,
} from "../services/leases.js";
import type { VermieterLeaseStatus } from "../db/types.js";

const VALID_STATUS: VermieterLeaseStatus[] = ["active", "ended"];

function parseInput(body: unknown): LeaseInput | null {
  const b = body as Partial<LeaseInput> | null;
  if (!b || typeof b.unitId !== "string" || !b.unitId) return null;
  if (typeof b.startDate !== "string" || !b.startDate) return null;
  if (typeof b.coldRentCents !== "number" || !Number.isInteger(b.coldRentCents) || b.coldRentCents < 0) return null;
  if (typeof b.nkPrepaymentCents !== "number" || !Number.isInteger(b.nkPrepaymentCents) || b.nkPrepaymentCents < 0) return null;
  if (!Array.isArray(b.tenantIds)) return null;
  if (b.status && !VALID_STATUS.includes(b.status)) return null;
  if (b.personCount != null && (typeof b.personCount !== "number" || !Number.isInteger(b.personCount) || b.personCount < 0)) return null;
  return {
    unitId: b.unitId,
    startDate: b.startDate,
    endDate: b.endDate ?? null,
    coldRentCents: b.coldRentCents,
    nkPrepaymentCents: b.nkPrepaymentCents,
    depositCents: b.depositCents ?? null,
    depositPaidDate: b.depositPaidDate ?? null,
    depositReturnedDate: b.depositReturnedDate ?? null,
    status: b.status,
    notes: b.notes,
    tenantIds: b.tenantIds as string[],
    // Omitted/null -> createLease defaults to tenantIds.length, see
    // LeaseInput.personCount's doc comment.
    personCount: b.personCount ?? null,
  };
}

export function registerLeaseRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/leases", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { unitId } = request.query as { unitId?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.leases.view");
    return listLeases(sdk, workspaceId, unitId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/leases/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.leases.view");
    const lease = getLease(sdk, workspaceId, id);
    if (!lease) {
      reply.code(404);
      return { message: "Lease not found" };
    }
    return lease;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/leases", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.leases.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "unitId, startDate, coldRentCents, nkPrepaymentCents and tenantIds are required" };
    }
    reply.code(201);
    return createLease(sdk, workspaceId, input);
  });

  app.patch("/api/v1/workspaces/:workspaceId/modules/vermieter/leases/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.leases.manage");
    const body = (request.body as Record<string, unknown>) ?? {};
    if ("coldRentCents" in body || "nkPrepaymentCents" in body) {
      reply.code(400);
      return { message: "Use POST .../leases/:id/rent-changes to change cold rent or NK prepayment" };
    }
    if ("personCount" in body && (typeof body.personCount !== "number" || !Number.isInteger(body.personCount) || body.personCount < 0)) {
      reply.code(400);
      return { message: "personCount must be a non-negative integer" };
    }
    const updated = updateLease(sdk, workspaceId, id, body);
    if (!updated) {
      reply.code(404);
      return { message: "Lease not found" };
    }
    return updated;
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/leases/:id/rent-changes", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.leases.view");
    const lease = getLease(sdk, workspaceId, id);
    if (!lease) {
      reply.code(404);
      return { message: "Lease not found" };
    }
    return listRentChanges(sdk, id);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/leases/:id/rent-changes", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.leases.manage");
    const b = request.body as { effectiveDate?: string; coldRentCents?: number; nkPrepaymentCents?: number; note?: string };
    if (!b || typeof b.effectiveDate !== "string" || !b.effectiveDate) {
      reply.code(400);
      return { message: "effectiveDate is required" };
    }
    if (typeof b.coldRentCents !== "number" || typeof b.nkPrepaymentCents !== "number") {
      reply.code(400);
      return { message: "coldRentCents and nkPrepaymentCents are required" };
    }
    const updated = changeLeaseRent(sdk, workspaceId, id, {
      effectiveDate: b.effectiveDate,
      coldRentCents: b.coldRentCents,
      nkPrepaymentCents: b.nkPrepaymentCents,
      note: b.note,
    });
    if (!updated) {
      reply.code(404);
      return { message: "Lease not found" };
    }
    reply.code(201);
    return updated;
  });
}
