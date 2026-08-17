import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi } from "../api.js";

const methodLabel: Record<string, string> = { bank_transfer: "Überweisung", cash: "Bar", direct_debit: "Lastschrift", other: "Sonstiges", open: "Offen" };

/** Ausgabenliste - manuelle Erfassung, siehe services/expenses.ts. */
function ExpensesListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: expenses } = useQuery({
    queryKey: ["module-faktura-expenses", workspaceId],
    queryFn: () => fakturaApi.expenses.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ausgaben</h1>
        <Link to={`/w/${workspaceId}/modules/faktura/ausgaben/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neue Ausgabe
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {expenses?.map((expense) => (
          <li key={expense.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium">{expense.description}</span>
              <span className="ml-2 text-xs text-ink-muted">{expense.expenseDate.slice(0, 10)}</span>
            </span>
            <span className="flex items-center gap-3 text-xs text-ink-muted">
              <span>{methodLabel[expense.paymentMethod]}</span>
              <span className="font-medium text-ink">{formatCents(expense.amountCents)}</span>
            </span>
          </li>
        ))}
        {expenses?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Ausgaben erfasst.</li>}
      </ul>
    </div>
  );
}

export { ExpensesListPage };
