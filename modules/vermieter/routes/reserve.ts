import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listReserveTransactions, getReserveBalance, createReserveTransaction, deleteReserveTransaction, type ReserveTransactionInput } from "../services/reserve.js";

function parseInput(body: unknown): ReserveTransactionInput | null {
  const b = body as Partial<ReserveTransactionInput> | null;
  if (!b || typeof b.propertyId !== "string" || !b.propertyId) return null;
  if (typeof b.date !== "string" || !b.date) return null;
  if (typeof b.amountCents !== "number" || !Number.isInteger(b.amountCents) || b.amountCents === 0) return null;
  return { propertyId: b.propertyId, date: b.date, amountCents: b.amountCents, note: b.note };
}

export function registerReserveRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/vermieter/reserve", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { propertyId } = request.query as { propertyId?: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.reserve.view");
    if (!propertyId) {
      reply.code(400);
      return { message: "propertyId query param is required" };
    }
    return { transactions: listReserveTransactions(sdk, workspaceId, propertyId), balanceCents: getReserveBalance(sdk, workspaceId, propertyId) };
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/vermieter/reserve", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.reserve.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "propertyId, date and a non-zero amountCents are required" };
    }
    reply.code(201);
    return createReserveTransaction(sdk, workspaceId, input);
  });

  app.delete("/api/v1/workspaces/:workspaceId/modules/vermieter/reserve/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "vermieter.reserve.manage");
    const deleted = deleteReserveTransaction(sdk, workspaceId, id);
    if (!deleted) {
      reply.code(404);
      return { message: "Reserve transaction not found" };
    }
    reply.code(204);
  });
}
