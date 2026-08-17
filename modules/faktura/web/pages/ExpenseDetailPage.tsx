import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { fakturaApi, type ExpenseInput, type ExpensePaymentMethod, type TaxRateBasisPoints } from "../api.js";
import { AttachmentsPanel } from "../components/AttachmentsPanel.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const today = () => new Date().toISOString().slice(0, 10);

/** Ausgabe erfassen (`:id === "neu"`) oder anzeigen (inkl. Belegfoto-Anhang) - kein Bearbeiten/Löschen in Phase 3, siehe services/expenses.ts. */
function ExpenseDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();

  const { data: expense } = useQuery({
    queryKey: ["module-faktura-expense", workspaceId, id],
    queryFn: () => fakturaApi.expenses.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: accounts } = useQuery({
    queryKey: ["module-faktura-accounts", workspaceId],
    queryFn: () => fakturaApi.accounts.list(workspaceId!),
    enabled: Boolean(workspaceId) && isNew,
  });
  const { data: suppliers } = useQuery({
    queryKey: ["module-faktura-suppliers", workspaceId],
    queryFn: () => fakturaApi.suppliers.list(workspaceId!),
    enabled: Boolean(workspaceId) && isNew,
  });
  const expenseAccounts = accounts?.filter((a) => a.accountType === "expense");

  const [supplierId, setSupplierId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0,00");
  const [taxRate, setTaxRate] = useState<TaxRateBasisPoints>(1900);
  const [expenseDate, setExpenseDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("bank_transfer");

  const createMutation = useMutation({
    mutationFn: () => {
      const input: ExpenseInput = {
        supplierId: supplierId || null,
        expenseAccountId,
        description,
        amountCents: parseCentsInput(amount) ?? 0,
        taxRateBasisPoints: taxRate,
        expenseDate,
        paymentMethod,
      };
      return fakturaApi.expenses.create(workspaceId!, input);
    },
    onSuccess: (created) => navigate(`/w/${workspaceId}/modules/faktura/ausgaben/${created.id}`),
  });

  if (!isNew) {
    if (!expense) return null;
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <h1 className="text-xl font-semibold">{expense.description}</h1>
        <section className="space-y-2 rounded-md border border-border p-3 text-sm">
          <div className="flex justify-between">
            <span>Datum</span>
            <span>{expense.expenseDate.slice(0, 10)}</span>
          </div>
          <div className="flex justify-between">
            <span>Betrag (brutto)</span>
            <span>{formatCents(expense.amountCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>USt.-Satz</span>
            <span>{(expense.taxRateBasisPoints / 100).toFixed(0)}%</span>
          </div>
        </section>
        <AttachmentsPanel workspaceId={workspaceId!} entityType="expense" entityId={expense.id} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Neue Ausgabe</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (description.trim() && expenseAccountId) createMutation.mutate();
        }}
        className="space-y-4"
      >
        <label className={labelClass}>
          <span className={labelTextClass}>Beschreibung *</span>
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Betrag brutto (€)</span>
            <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>USt.-Satz</span>
            <select className={inputClass} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) as TaxRateBasisPoints)}>
              <option value={1900}>19%</option>
              <option value={700}>7%</option>
              <option value={0}>0%</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Datum</span>
            <input type="date" className={inputClass} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Aufwandskonto *</span>
            <select className={inputClass} value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} required>
              <option value="">–</option>
              {expenseAccounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Lieferant</span>
            <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">–</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={labelClass}>
          <span className={labelTextClass}>Zahlungsart</span>
          <select className={inputClass} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod)}>
            <option value="bank_transfer">Überweisung (sofort bezahlt)</option>
            <option value="cash">Bar (sofort bezahlt)</option>
            <option value="direct_debit">Lastschrift (sofort bezahlt)</option>
            <option value="other">Sonstiges (sofort bezahlt)</option>
            <option value="open">Noch offen (Verbindlichkeit)</option>
          </select>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Ausgabe erfassen
          </button>
          {createMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>
    </div>
  );
}

export { ExpenseDetailPage };
