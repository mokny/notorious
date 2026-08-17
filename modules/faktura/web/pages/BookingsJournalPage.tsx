import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi } from "../api.js";

const statusLabel: Record<string, string> = { confirmed: "Bestätigt", reversed: "Storniert" };

/** Bestätigtes Buchungsjournal (inkl. Stornos) - unveränderlich, Korrektur nur per Storno-Buchung, siehe services/bookings.ts::createReversalBooking. */
function BookingsJournalPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();

  const { data: confirmed } = useQuery({
    queryKey: ["module-faktura-bookings-confirmed", workspaceId],
    queryFn: () => fakturaApi.bookings.list(workspaceId!, "confirmed"),
    enabled: Boolean(workspaceId),
  });
  const { data: reversed } = useQuery({
    queryKey: ["module-faktura-bookings-reversed", workspaceId],
    queryFn: () => fakturaApi.bookings.list(workspaceId!, "reversed"),
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

  const reverseMutation = useMutation({
    mutationFn: (id: string) => fakturaApi.bookings.reverse(workspaceId!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-bookings-confirmed", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-bookings-reversed", workspaceId] });
    },
  });

  const entries = [...(confirmed ?? []), ...(reversed ?? [])].sort((a, b) => (a.bookingDate < b.bookingDate ? 1 : -1));

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Buchungsjournal</h1>
          <p className="text-sm text-ink-muted">Bestätigte Buchungen (unveränderlich) und Stornos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/w/${workspaceId}/modules/faktura/buchungen`} className="rounded-md border border-border px-3 py-1.5 text-sm">
            Inbox
          </Link>
          <a
            href={`/api/v1/workspaces/${workspaceId}/modules/faktura/datev-export`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white"
          >
            DATEV-Export
          </a>
        </div>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {entries.map((booking) => (
          <li key={booking.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <div className="flex-1">
              <div className={booking.status === "reversed" ? "line-through text-ink-muted" : ""}>{booking.description}</div>
              <div className="text-xs text-ink-muted">
                {booking.bookingDate.slice(0, 10)} · Soll: {accountLabel(booking.debitAccountId)} · Haben: {accountLabel(booking.creditAccountId)} ·{" "}
                {statusLabel[booking.status]}
              </div>
            </div>
            <span className="font-medium">{formatCents(booking.amountCents)}</span>
            {booking.status === "confirmed" && (
              <button
                type="button"
                disabled={reverseMutation.isPending}
                onClick={() => reverseMutation.mutate(booking.id)}
                className="text-xs text-red-500 disabled:opacity-50"
              >
                Stornieren
              </button>
            )}
          </li>
        ))}
        {entries.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine bestätigten Buchungen.</li>}
      </ul>
    </div>
  );
}

export { BookingsJournalPage };
