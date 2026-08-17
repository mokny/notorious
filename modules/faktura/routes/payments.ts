import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listPayments, getInvoicePaymentSummary, recordPayment, deletePayment, type PaymentInput } from "../services/payments.js";
import { recordAudit } from "../services/audit.js";
import { formatCents } from "@notorious/shared";
import type { FakturaPaymentMethod } from "../db/types.js";

const VALID_METHODS: FakturaPaymentMethod[] = ["bank_transfer", "cash", "direct_debit", "other"];

function parseInput(body: unknown): PaymentInput | null {
  const b = body as Partial<PaymentInput> | null;
  if (!b || typeof b.amountCents !== "number" || !Number.isInteger(b.amountCents) || b.amountCents <= 0) return null;
  if (typeof b.paidAt !== "string" || !b.paidAt) return null;
  if (!b.method || !VALID_METHODS.includes(b.method)) return null;
  return { amountCents: b.amountCents, paidAt: b.paidAt, method: b.method, reference: b.reference, notes: b.notes };
}

export function registerPaymentRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:invoiceId/payments", async (request) => {
    const { workspaceId, invoiceId } = request.params as { workspaceId: string; invoiceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.view");
    return { payments: listPayments(sdk, workspaceId, invoiceId), summary: getInvoicePaymentSummary(sdk, workspaceId, invoiceId) };
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/documents/:invoiceId/payments", async (request, reply) => {
    const { workspaceId, invoiceId } = request.params as { workspaceId: string; invoiceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "amountCents, paidAt and a valid method are required" };
    }
    let payment;
    try {
      payment = recordPayment(sdk, workspaceId, invoiceId, userId, input);
    } catch (error) {
      reply.code(409);
      return { message: error instanceof Error ? error.message : "Could not record payment" };
    }
    recordAudit(sdk, {
      workspaceId,
      entityType: "invoice",
      entityId: invoiceId,
      action: "payment_recorded",
      actorId: userId,
      summary: `Zahlung erfasst: ${formatCents(payment.amountCents)}`,
    });
    reply.code(201);
    return payment;
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/faktura/payments/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.documents.manage");
    const deleted = deletePayment(sdk, workspaceId, id);
    if (!deleted) {
      reply.code(404);
      return { message: "Payment not found" };
    }
    recordAudit(sdk, { workspaceId, entityType: "payment", entityId: id, action: "deleted", actorId: userId, summary: "Zahlung gelöscht" });
    reply.code(204);
  });
}
