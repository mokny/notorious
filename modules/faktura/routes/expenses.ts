import type { FastifyInstance } from "fastify";
import type { ModuleSdk } from "../manifest.js";
import { listExpenses, getExpense, createExpense, type ExpenseInput } from "../services/expenses.js";
import { recordAudit } from "../services/audit.js";
import { formatCents } from "@notorious/shared";
import type { FakturaExpensePaymentMethod, FakturaTaxRateBasisPoints } from "../db/types.js";

const VALID_METHODS: FakturaExpensePaymentMethod[] = ["bank_transfer", "cash", "direct_debit", "other", "open"];
const VALID_TAX_RATES: FakturaTaxRateBasisPoints[] = [0, 700, 1900];

function parseInput(body: unknown): ExpenseInput | null {
  const b = body as Partial<ExpenseInput> | null;
  if (!b || typeof b.expenseAccountId !== "string" || !b.expenseAccountId) return null;
  if (typeof b.description !== "string" || !b.description.trim()) return null;
  if (typeof b.amountCents !== "number" || !Number.isInteger(b.amountCents) || b.amountCents <= 0) return null;
  if (typeof b.taxRateBasisPoints !== "number" || !VALID_TAX_RATES.includes(b.taxRateBasisPoints as FakturaTaxRateBasisPoints)) return null;
  if (typeof b.expenseDate !== "string" || !b.expenseDate) return null;
  if (!b.paymentMethod || !VALID_METHODS.includes(b.paymentMethod)) return null;
  return {
    supplierId: b.supplierId ?? null,
    expenseAccountId: b.expenseAccountId,
    description: b.description,
    amountCents: b.amountCents,
    taxRateBasisPoints: b.taxRateBasisPoints as FakturaTaxRateBasisPoints,
    expenseDate: b.expenseDate,
    paymentMethod: b.paymentMethod,
  };
}

export function registerExpenseRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/expenses", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.view");
    return listExpenses(sdk, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/modules/faktura/expenses/:id", async (request, reply) => {
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.view");
    const expense = getExpense(sdk, workspaceId, id);
    if (!expense) {
      reply.code(404);
      return { message: "Expense not found" };
    }
    return expense;
  });

  app.post("/api/v1/workspaces/:workspaceId/modules/faktura/expenses", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const { userId } = await sdk.requireModuleAccess(request, workspaceId, "faktura.accounting.manage");
    const input = parseInput(request.body);
    if (!input) {
      reply.code(400);
      return { message: "expenseAccountId, description, amountCents, taxRateBasisPoints, expenseDate and paymentMethod are required" };
    }
    const expense = createExpense(sdk, workspaceId, userId, input);
    recordAudit(sdk, {
      workspaceId,
      entityType: "expense",
      entityId: expense.id,
      action: "created",
      actorId: userId,
      summary: `Ausgabe erfasst: ${expense.description} (${formatCents(expense.amountCents)})`,
    });
    reply.code(201);
    return expense;
  });
}
