import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi } from "../api.js";

const levelLabel: Record<number, string> = { 1: "Zahlungserinnerung", 2: "1. Mahnung", 3: "2. Mahnung" };

/** Detail-/Versandseite einer Mahnung: zeigt den berechneten Entwurf (Gebühr/Zinsen vorausgefüllt), PDF-Vorschau, Button "Senden" mit Bestätigung. */
function DunningDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["module-faktura-dunning-letter", workspaceId, id];

  const { data: letter } = useQuery({ queryKey, queryFn: () => fakturaApi.dunning.get(workspaceId!, id!), enabled: Boolean(workspaceId) });

  const [recipient, setRecipient] = useState("");
  const sendMutation = useMutation({
    mutationFn: () => fakturaApi.dunning.send(workspaceId!, id!, recipient.trim() || undefined),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  if (!letter) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {levelLabel[letter.level]} {letter.number ?? "(Entwurf)"}
        </h1>
        <a
          href={`/api/v1/workspaces/${workspaceId}/modules/faktura/dunning-letters/${letter.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          PDF
        </a>
      </div>

      <p className="text-sm text-ink-muted">
        Zu Rechnung{" "}
        <Link className="underline" to={`/w/${workspaceId}/modules/faktura/belege/${letter.invoiceId}`}>
          {letter.invoiceId}
        </Link>{" "}
        · {letter.daysOverdue} Tage überfällig
      </p>

      <section className="space-y-2 rounded-md border border-border p-3 text-sm">
        <div className="flex justify-between">
          <span>Offener Rechnungsbetrag</span>
          <span>{formatCents(letter.openAmountCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Mahngebühr</span>
          <span>{formatCents(letter.feeCents)}</span>
        </div>
        <div className="flex justify-between">
          <span>Verzugszinsen</span>
          <span>{formatCents(letter.interestCents)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2 font-semibold">
          <span>Gesamt fällig</span>
          <span>{formatCents(letter.totalDueCents)}</span>
        </div>
      </section>

      {letter.status === "draft" ? (
        <section className="flex items-center gap-2 rounded-md border border-border p-3">
          <input
            type="email"
            placeholder="Empfänger (leer = Kundenkontakt)"
            className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
          <button
            type="button"
            disabled={sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
            className="whitespace-nowrap rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Senden
          </button>
        </section>
      ) : (
        <p className="text-sm text-emerald-600">Versendet am {letter.sentAt?.slice(0, 10)}.</p>
      )}
      {sendMutation.isError && <p className="text-xs text-red-500">{sendMutation.error instanceof Error ? sendMutation.error.message : "Fehler."}</p>}
    </div>
  );
}

export { DunningDetailPage };
