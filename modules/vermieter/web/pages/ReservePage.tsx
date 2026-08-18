import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { vermieterApi } from "../api.js";

const inputClass = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const today = () => new Date().toISOString().slice(0, 10);

/** Instandhaltungsrücklage: Ledger mit laufendem Saldo je Immobilie, Einzahlung/Entnahme erfassen. */
function ReservePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();

  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [propertyId, setPropertyId] = useState("");
  const reserveKey = ["module-vermieter-reserve", workspaceId, propertyId];
  const { data: reserve } = useQuery({
    queryKey: reserveKey,
    queryFn: () => vermieterApi.reserve.get(workspaceId!, propertyId),
    enabled: Boolean(workspaceId) && Boolean(propertyId),
  });

  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const [note, setNote] = useState("");

  const createMutation = useMutation({
    mutationFn: () => {
      const parsed = parseCentsInput(amount) ?? 0;
      const amountCents = kind === "deposit" ? Math.abs(parsed) : -Math.abs(parsed);
      return vermieterApi.reserve.create(workspaceId!, { propertyId, date, amountCents, note });
    },
    onSuccess: () => {
      setAmount("");
      setNote("");
      void queryClient.invalidateQueries({ queryKey: reserveKey });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => vermieterApi.reserve.remove(workspaceId!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: reserveKey }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (propertyId && amount.trim()) createMutation.mutate();
  }

  let runningBalance = 0;
  const rows = (reserve?.transactions ?? []).map((tx) => {
    runningBalance += tx.amountCents;
    return { ...tx, runningBalance };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Instandhaltungsrücklage</h1>

      <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
        <option value="">Immobilie wählen</option>
        {properties?.map((property) => (
          <option key={property.id} value={property.id}>
            {property.name}
          </option>
        ))}
      </select>

      {propertyId && (
        <>
          <div className="rounded-lg border border-border p-4 text-center">
            <span className="text-xs text-ink-muted">Aktueller Saldo</span>
            <p className="text-2xl font-semibold">{formatCents(reserve?.balanceCents ?? 0)}</p>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-4 items-end gap-2 rounded-md border border-border p-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Datum</span>
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Art</span>
              <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as "deposit" | "withdrawal")}>
                <option value="deposit">Einzahlung</option>
                <option value="withdrawal">Entnahme</option>
              </select>
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Betrag (€)</span>
              <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </label>
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
              Buchen
            </button>
            <label className={`${labelClass} col-span-4`}>
              <span className={labelTextClass}>Notiz</span>
              <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </form>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Datum</th>
                  <th className="px-3 py-2 text-left">Notiz</th>
                  <th className="px-3 py-2 text-right">Betrag</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-3 py-2">{tx.date}</td>
                    <td className="px-3 py-2 text-ink-muted">{tx.note}</td>
                    <td className={`px-3 py-2 text-right ${tx.amountCents >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {tx.amountCents >= 0 ? "+" : ""}
                      {formatCents(tx.amountCents)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{formatCents(tx.runningBalance)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-xs text-ink-muted hover:text-red-500" onClick={() => removeMutation.mutate(tx.id)}>
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-ink-muted">
                      Noch keine Buchungen.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export { ReservePage };
