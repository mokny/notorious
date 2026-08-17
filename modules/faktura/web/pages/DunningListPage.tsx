import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi } from "../api.js";

const levelLabel: Record<number, string> = { 0: "–", 1: "Zahlungserinnerung", 2: "1. Mahnung", 3: "2. Mahnung" };
const statusLabel: Record<string, string> = { draft: "Entwurf", sent: "Versendet" };

/** Übersicht überfälliger Rechnungen mit vorgeschlagener nächster Mahnstufe - siehe services/dunning.ts::listOverdueInvoices. */
function DunningListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["module-faktura-dunning-overdue", workspaceId];

  const { data: overdue } = useQuery({ queryKey, queryFn: () => fakturaApi.dunning.overdue(workspaceId!), enabled: Boolean(workspaceId) });
  const { data: letters } = useQuery({
    queryKey: ["module-faktura-dunning-letters", workspaceId],
    queryFn: () => fakturaApi.dunning.listAll(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const createMutation = useMutation({
    mutationFn: ({ invoiceId, level }: { invoiceId: string; level: 1 | 2 | 3 }) => fakturaApi.dunning.create(workspaceId!, invoiceId, level),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-dunning-letters", workspaceId] });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold">Mahnungen</h1>
        <p className="text-sm text-ink-muted">Überfällige, noch nicht vollständig bezahlte Rechnungen mit vorgeschlagener Mahnstufe.</p>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {overdue?.map((invoice) => (
          <li key={invoice.invoiceId} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <Link to={`/w/${workspaceId}/modules/faktura/belege/${invoice.invoiceId}`} className="font-medium underline">
              {invoice.invoiceNumber}
            </Link>
            <span className="flex items-center gap-4 text-xs text-ink-muted">
              <span>{invoice.daysOverdue} Tage überfällig</span>
              <span>Offen: {formatCents(invoice.openAmountCents)}</span>
              <span>Zuletzt: {levelLabel[invoice.lastSentLevel]}</span>
            </span>
            {invoice.suggestedLevel && (
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate({ invoiceId: invoice.invoiceId, level: invoice.suggestedLevel! })}
                className="rounded-md bg-accent px-3 py-1 text-xs text-white disabled:opacity-50"
              >
                {levelLabel[invoice.suggestedLevel]} erstellen
              </button>
            )}
          </li>
        ))}
        {overdue?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Keine überfälligen Rechnungen.</li>}
      </ul>

      <div>
        <h2 className="text-sm font-semibold text-ink">Erstellte Mahnungen</h2>
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {letters?.map((letter) => (
            <li key={letter.id}>
              <Link
                to={`/w/${workspaceId}/modules/faktura/mahnungen/${letter.id}`}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
              >
                <span className="font-medium">{letter.number ?? "(Entwurf)"}</span>
                <span className="flex items-center gap-3 text-xs text-ink-muted">
                  <span>{levelLabel[letter.level]}</span>
                  <span>{statusLabel[letter.status]}</span>
                  <span>{formatCents(letter.totalDueCents)}</span>
                </span>
              </Link>
            </li>
          ))}
          {letters?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Mahnungen erstellt.</li>}
        </ul>
      </div>
    </div>
  );
}

export { DunningListPage };
