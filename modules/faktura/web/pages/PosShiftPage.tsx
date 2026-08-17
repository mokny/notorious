import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { fakturaApi } from "../api.js";

const inputClass = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

/** Kassenbuch: Kasse öffnen (Anfangsbestand) / schließen (Zählung, Soll-Ist-Vergleich) - siehe services/posShifts.ts. */
function PosShiftPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const activeQueryKey = ["module-faktura-pos-active-shift", workspaceId];

  const { data: activeShift } = useQuery({ queryKey: activeQueryKey, queryFn: () => fakturaApi.pos.activeShift(workspaceId!), enabled: Boolean(workspaceId) });
  const { data: shifts } = useQuery({
    queryKey: ["module-faktura-pos-shifts", workspaceId],
    queryFn: () => fakturaApi.pos.shifts(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [openingBalance, setOpeningBalance] = useState("0,00");
  const [countedCash, setCountedCash] = useState("0,00");

  const openMutation = useMutation({
    mutationFn: () => fakturaApi.pos.openShift(workspaceId!, parseCentsInput(openingBalance) ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activeQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-pos-shifts", workspaceId] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () => fakturaApi.pos.closeShift(workspaceId!, activeShift!.id, parseCentsInput(countedCash) ?? 0),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activeQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-pos-shifts", workspaceId] });
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Kassenbuch</h1>
        {activeShift && (
          <Link to={`/w/${workspaceId}/modules/faktura/kasse`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
            Zum Kassen-Terminal
          </Link>
        )}
      </div>

      {!activeShift ? (
        <section className="flex items-end gap-2 rounded-md border border-border p-3">
          <label className="space-y-1 text-xs">
            <span className="text-ink-muted">Anfangsbestand (€)</span>
            <input className={inputClass} value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={openMutation.isPending}
            onClick={() => openMutation.mutate()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Kasse öffnen
          </button>
        </section>
      ) : (
        <section className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm">
            Kasse geöffnet seit {activeShift.openedAt.slice(0, 16).replace("T", " ")} · Anfangsbestand {formatCents(activeShift.openingBalanceCents)}
          </p>
          <div className="flex items-end gap-2">
            <label className="space-y-1 text-xs">
              <span className="text-ink-muted">Gezählter Bestand (€)</span>
              <input className={inputClass} value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
            </label>
            <button
              type="button"
              disabled={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
              className="rounded-md border border-red-500 px-3 py-1.5 text-sm text-red-500 disabled:opacity-50"
            >
              Kasse schließen
            </button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Vergangene Schichten</h2>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {shifts
            ?.filter((s) => s.status === "closed")
            .map((shift) => (
              <li key={shift.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{shift.closedAt?.slice(0, 16).replace("T", " ")}</span>
                <span className="flex items-center gap-3 text-xs text-ink-muted">
                  <span>Soll: {formatCents(shift.expectedCashCents ?? 0)}</span>
                  <span>Ist: {formatCents(shift.countedCashCents ?? 0)}</span>
                  <span className={shift.differenceCents === 0 ? "text-emerald-600" : "text-red-500"}>
                    Diff.: {formatCents(shift.differenceCents ?? 0)}
                  </span>
                </span>
              </li>
            ))}
          {shifts?.filter((s) => s.status === "closed").length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">Noch keine abgeschlossenen Schichten.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

export { PosShiftPage };
