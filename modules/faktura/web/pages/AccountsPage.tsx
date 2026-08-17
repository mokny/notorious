import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fakturaApi, type AccountInput, type AccountType } from "../api.js";

const typeLabel: Record<AccountType, string> = {
  revenue: "Erlöse",
  expense: "Aufwand",
  asset: "Vermögen",
  liability: "Verbindlichkeit",
  equity: "Eigenkapital",
};

const inputClass = "rounded-md border border-border bg-surface px-2 py-1 text-sm";
const EMPTY: AccountInput = { code: "", name: "", accountType: "expense" };

/** Kontenrahmen-Verwaltung: reduzierter Standard-Kontenrahmen (SKR03/SKR04, siehe Firmeneinstellungen), frei erweiter-/editierbar. */
function AccountsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["module-faktura-accounts", workspaceId];

  const { data: accounts } = useQuery({ queryKey, queryFn: () => fakturaApi.accounts.list(workspaceId!), enabled: Boolean(workspaceId) });

  const [form, setForm] = useState<AccountInput>(EMPTY);

  const seedMutation = useMutation({
    mutationFn: () => fakturaApi.accounts.seed(workspaceId!),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const createMutation = useMutation({
    mutationFn: () => fakturaApi.accounts.create(workspaceId!, form),
    onSuccess: () => {
      setForm(EMPTY);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => fakturaApi.accounts.archive(workspaceId!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Kontenrahmen</h1>
        <button
          type="button"
          disabled={seedMutation.isPending}
          onClick={() => seedMutation.mutate()}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Standard-Konten initialisieren
        </button>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {accounts?.map((account) => (
          <li key={account.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              <span className="font-mono text-xs text-ink-muted">{account.code}</span> {account.name}
            </span>
            <span className="flex items-center gap-3 text-xs text-ink-muted">
              <span>{typeLabel[account.accountType]}</span>
              {account.isSystem && <span>Standard</span>}
              <button type="button" className="hover:text-red-500" onClick={() => archiveMutation.mutate(account.id)}>
                Archivieren
              </button>
            </span>
          </li>
        ))}
        {accounts?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Konten angelegt.</li>}
      </ul>

      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Kontonummer</span>
          <input className={inputClass} value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Name</span>
          <input className={inputClass} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-ink-muted">Typ</span>
          <select
            className={inputClass}
            value={form.accountType}
            onChange={(e) => setForm((prev) => ({ ...prev, accountType: e.target.value as AccountType }))}
          >
            {Object.entries(typeLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={createMutation.isPending || !form.code.trim() || !form.name.trim()}
          onClick={() => createMutation.mutate()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Konto anlegen
        </button>
      </div>
    </div>
  );
}

export { AccountsPage };
