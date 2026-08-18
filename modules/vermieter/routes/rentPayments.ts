import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listRentPayments, createRentPayment, recordPayment, type RentPaymentInput } from "../services/rentPayments.js";

function parseInput(body: unknown): RentPaymentInput | null {
  const b = body as Partial<RentPaymentInput> | null;
  if (!b || typeof b.leaseId !== "string" || !b.leaseId) return null;
  if (typeof b.periodYear !== "number" || typeof b.periodMonth !== "number") return null;
  if (b.periodMonth < 1 || b.periodMonth > 12) return null;
  if (typeof b.coldRentDueCents !== "number" || typeof b.nkPrepaymentDueCents !== "number") return null;
  return {
    leaseId: b.leaseId,
    periodYear: b.periodYear,
    periodMonth: b.periodMonth,
    coldRentDueCents: b.coldRentDueCents,
    nkPrepaymentDueCents: b.nkPrepaymentDueCents,
    paidAmountCents: b.paidAmountCents ?? null,
    paidDate: b.paidDate ?? null,
    note: b.note,
  };
}

export function registerRentPaymentRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/rent-payments", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { leaseId } = request.query as { leaseId?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.payments.view");
    return listRentPayments(sdk, workspaceId, leaseId);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/rent-payments", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.payments.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "leaseId, periodYear, periodMonth, coldRentDueCents and nkPrepaymentDueCents are required" };
    }
    reply.code(201);
    return createRentPayment(sdk, workspaceId, input);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/rent-payments/:id/record", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.payments.manage");
    const b = request.body as { paidAmountCents?: number; paidDate?: string };
    if (typeof b?.paidAmountCents !== "number" || typeof b.paidDate !== "string" || !b.paidDate) {
      reply.code(400);
      return { message: "paidAmountCents and paidDate are required" };
    }
    const updated = recordPayment(sdk, workspaceId, id, b.paidAmountCents, b.paidDate);
    if (!updated) {
      reply.code(404);
      return { message: "Rent payment not found" };
    }
    return updated;
  });
}
