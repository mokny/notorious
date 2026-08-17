import type { ModuleSdk } from "../manifest.js";
import type { FakturaExpenseRow, FakturaExpensePaymentMethod, FakturaTaxRateBasisPoints } from "../db/types.js";
import { proposeExpenseBookings } from "./bookings.js";

export interface ExpenseDto {
  id: string;
  supplierId: string | null;
  expenseAccountId: string;
  description: string;
  amountCents: number;
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
  expenseDate: string;
  paymentMethod: FakturaExpensePaymentMethod;
  createdBy: string;
  createdAt: string;
}

function rowToDto(row: FakturaExpenseRow): ExpenseDto {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    expenseAccountId: row.expense_account_id,
    description: row.description,
    amountCents: row.amount_cents,
    taxRateBasisPoints: row.tax_rate_basis_points,
    expenseDate: row.expense_date,
    paymentMethod: row.payment_method,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function listExpenses(sdk: ModuleSdk, workspaceId: string): ExpenseDto[] {
  const rows = sdk.sqlite
    .prepare("SELECT * FROM faktura_expenses WHERE workspace_id = ? ORDER BY expense_date DESC, created_at DESC")
    .all(workspaceId) as FakturaExpenseRow[];
  return rows.map(rowToDto);
}

export function getExpense(sdk: ModuleSdk, workspaceId: string, expenseId: string): ExpenseDto | null {
  const row = sdk.sqlite.prepare("SELECT * FROM faktura_expenses WHERE id = ? AND workspace_id = ?").get(expenseId, workspaceId) as
    | FakturaExpenseRow
    | undefined;
  return row ? rowToDto(row) : null;
}

export function requireExpense(sdk: ModuleSdk, workspaceId: string, expenseId: string): FakturaExpenseRow {
  const row = sdk.sqlite.prepare("SELECT * FROM faktura_expenses WHERE id = ? AND workspace_id = ?").get(expenseId, workspaceId) as
    | FakturaExpenseRow
    | undefined;
  if (!row) throw new Error("Expense not found");
  return row;
}

export interface ExpenseInput {
  supplierId?: string | null;
  expenseAccountId: string;
  description: string;
  amountCents: number;
  taxRateBasisPoints: FakturaTaxRateBasisPoints;
  expenseDate: string;
  paymentMethod: FakturaExpensePaymentMethod;
}

export function createExpense(sdk: ModuleSdk, workspaceId: string, actorId: string, input: ExpenseInput): ExpenseDto {
  const id = sdk.newId();
  const now = sdk.nowIso();
  sdk.sqlite
    .prepare(
      `INSERT INTO faktura_expenses (id, workspace_id, supplier_id, expense_account_id, description, amount_cents, tax_rate_basis_points, expense_date, payment_method, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      input.supplierId ?? null,
      input.expenseAccountId,
      input.description.trim(),
      input.amountCents,
      input.taxRateBasisPoints,
      input.expenseDate,
      input.paymentMethod,
      actorId,
      now,
    );
  const expense = getExpense(sdk, workspaceId, id)!;
  proposeExpenseBookings(sdk, workspaceId, actorId, expense);
  return expense;
}
