import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi } from "../api.js";

/** Zentrale Buchungs-Inbox: alle offenen Buchungsvorschläge aus Rechnungen/Gutschriften/Zahlungen/Ausgaben, einzeln oder per Mehrfachauswahl bestätigen oder ablehnen - siehe services/bookings.ts. */
function BookingsInboxPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const queryKey = ["module-faktura-bookings-proposed", workspaceId];

  const { data: bookings } = useQuery({
    queryKey,
    queryFn: () => fakturaApi.bookings.list(workspaceId!, "proposed"),
    enabled: Boolean(workspaceId),
  });
  const { data: accounts } = useQuery({
    queryKey: ["module-faktura-accounts", workspaceId],
    queryFn: () => fakturaApi.accounts.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const accountLabel = (id: string) => {
    const account = accounts?.find((a) => a.id === id);
    return account ? `${account.code} ${account.name}` : id;
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const confirmMutation = useMutation({
    mutationFn: (id: string) => fakturaApi.bookings.confirm(workspaceId!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });
  const confirmBulkMutation = useMutation({
    mutationFn: (ids: string[]) => fakturaApi.bookings.confirmBulk(workspaceId!, ids),
    onSuccess: () => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => fakturaApi.bookings.reject(workspaceId!, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Buchungs-Inbox</h1>
          <p className="text-sm text-ink-muted">Offene Buchungsvorschläge zum Bestätigen oder Ablehnen.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/w/${workspaceId}/modules/faktura/journal`} className="rounded-md border border-border px-3 py-1.5 text-sm">
            Journal
          </Link>
          <button
            type="button"
            disabled={selected.size === 0 || confirmBulkMutation.isPending}
            onClick={() => confirmBulkMutation.mutate(Array.from(selected))}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Ausgewählte bestätigen ({selected.size})
          </button>
        </div>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {bookings?.map((booking) => (
          <li key={booking.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <input type="checkbox" checked={selected.has(booking.id)} onChange={() => toggle(booking.id)} />
            <div className="flex-1">
              <div>{booking.description}</div>
              <div className="text-xs text-ink-muted">
                {booking.bookingDate.slice(0, 10)} · Soll: {accountLabel(booking.debitAccountId)} · Haben: {accountLabel(booking.creditAccountId)}
              </div>
            </div>
            <span className="font-medium">{formatCents(booking.amountCents)}</span>
            <button
              type="button"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate(booking.id)}
              className="rounded-md bg-accent px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              Bestätigen
            </button>
            <button
              type="button"
              disabled={rejectMutation.isPending}
              onClick={() => rejectMutation.mutate(booking.id)}
              className="text-xs text-red-500"
            >
              Ablehnen
            </button>
          </li>
        ))}
        {bookings?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Keine offenen Buchungsvorschläge.</li>}
      </ul>
    </div>
  );
}

export { BookingsInboxPage };
