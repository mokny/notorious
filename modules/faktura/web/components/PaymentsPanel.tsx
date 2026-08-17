import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { fakturaApi, type PaymentMethod } from "../api.js";

const methodLabel: Record<PaymentMethod, string> = {
  bank_transfer: "Überweisung",
  cash: "Bar",
  direct_debit: "Lastschrift",
  other: "Sonstiges",
};

const inputClass = "rounded-md border border-border bg-surface px-2 py-1 text-sm";
const today = () => new Date().toISOString().slice(0, 10);

/** Zahlungserfassung + offener Betrag für eine ausgestellte Rechnung - manuell, siehe services/payments.ts. */
export function PaymentsPanel(props: { workspaceId: string; invoiceId: string }) {
  const { workspaceId, invoiceId } = props;
  const queryClient = useQueryClient();
  const queryKey = ["module-faktura-payments", workspaceId, invoiceId];

  const { data } = useQuery({ queryKey, queryFn: () => fakturaApi.payments.list(workspaceId, invoiceId) });

  const [amount, setAmount] = useState("0,00");
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");

  const recordMutation = useMutation({
    mutationFn: () =>
      fakturaApi.payments.record(workspaceId, invoiceId, { amountCents: parseCentsInput(amount) ?? 0, paidAt, method, reference }),
    onSuccess: () => {
      setAmount("0,00");
      setReference("");
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => fakturaApi.payments.remove(workspaceId, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Zahlungen</h2>
        {data && (
          <span className={`text-sm ${data.summary.isFullyPaid ? "text-emerald-600" : "text-ink-muted"}`}>
            {data.summary.isFullyPaid ? "Vollständig bezahlt" : `Offen: ${formatCents(data.summary.openAmountCents)}`}
          </span>
        )}
      </div>

      <ul className="divide-y divide-border">
        {data?.payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <span>
              {payment.paidAt.slice(0, 10)} · {methodLabel[payment.method]} {payment.reference && `· ${payment.reference}`}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{formatCents(payment.amountCents)}</span>
              <button type="button" className="text-xs text-ink-muted hover:text-red-500" onClick={() => removeMutation.mutate(payment.id)}>
                Entfernen
              </button>
            </span>
          </li>
        ))}
        {data?.payments.length === 0 && <li className="py-1.5 text-sm text-ink-muted">Noch keine Zahlung erfasst.</li>}
      </ul>

      <div className="flex flex-wrap items-end gap-2 pt-2">
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Betrag (€)</span>
          <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Datum</span>
          <input type="date" className={inputClass} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Methode</span>
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="bank_transfer">Überweisung</option>
            <option value="cash">Bar</option>
            <option value="direct_debit">Lastschrift</option>
            <option value="other">Sonstiges</option>
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Referenz</span>
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={recordMutation.isPending}
          onClick={() => recordMutation.mutate()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Zahlung erfassen
        </button>
      </div>
    </section>
  );
}
