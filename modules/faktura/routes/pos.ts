import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { getActiveShift, listShifts, openShift, closeShift } from "../services/posShifts.js";
import { createPosSale, type PosSaleLineInput } from "../services/pos.js";
import { recordAudit } from "../services/audit.js";
import { formatCents } from "@notorious/shared";
import type { FakturaPaymentMethod } from "../db/types.js";

const VALID_PAYMENT_METHODS: FakturaPaymentMethod[] = ["bank_transfer", "cash", "direct_debit", "other"];

export function registerPosRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/pos/sale", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.pos.use");
    const { lines, paymentMethod } = request.body as { lines?: PosSaleLineInput[]; paymentMethod?: FakturaPaymentMethod };

    if (!Array.isArray(lines) || lines.length === 0 || lines.some((l) => !l.productId || !l.quantity || l.quantity <= 0)) {
      reply.code(400);
      return { message: "lines (productId, quantity > 0) are required" };
    }
    if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      reply.code(400);
      return { message: "a valid paymentMethod is required" };
    }

    let result;
    try {
      result = createPosSale(sdk, workspaceId, userId, { lines, paymentMethod });
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not create sale" };
    }

    recordAudit(sdk, {
      workspaceId,
      entityType: "document",
      entityId: result.document.id,
      action: "created",
      actorId: userId,
      summary: `Kassenverkauf ${result.document.number} (${formatCents(result.document.totalCents)})`,
    });
    reply.code(201);
    return result;
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/pos/shifts", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.pos.use");
    return listShifts(sdk, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/pos/shifts/active", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.pos.use");
    return getActiveShift(sdk, workspaceId);
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/pos/shifts", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.pos.use");
    const { openingBalanceCents } = request.body as { openingBalanceCents?: number };
    if (typeof openingBalanceCents !== "number" || !Number.isInteger(openingBalanceCents) || openingBalanceCents < 0) {
      reply.code(400);
      return { message: "openingBalanceCents must be a non-negative integer" };
    }
    let shift;
    try {
      shift = openShift(sdk, workspaceId, userId, openingBalanceCents);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not open shift" };
    }
    recordAudit(sdk, { workspaceId, entityType: "pos_shift", entityId: shift.id, action: "opened", actorId: userId, summary: "Kasse geöffnet" });
    reply.code(201);
    return shift;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/pos/shifts/:id/close", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.pos.use");
    const { countedCashCents } = request.body as { countedCashCents?: number };
    if (typeof countedCashCents !== "number" || !Number.isInteger(countedCashCents) || countedCashCents < 0) {
      reply.code(400);
      return { message: "countedCashCents must be a non-negative integer" };
    }
    let shift;
    try {
      shift = closeShift(sdk, workspaceId, userId, id, countedCashCents);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not close shift" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "pos_shift",
      entityId: shift.id,
      action: "closed",
      actorId: userId,
      summary: `Kasse geschlossen (Differenz: ${shift.differenceCents} Cent)`,
    });
    return shift;
  });
}
