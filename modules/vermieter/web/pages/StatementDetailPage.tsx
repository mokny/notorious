import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { vermieterApi, type VermieterEstimationMethod } from "../api.js";
import { getCostCategory, ALLOCATION_KEY_LABEL_DE } from "../../db/costCategories.js";

/** Mirrors modules/vermieter/pdf/text.de.ts's wording so the web view and the PDF explain estimated values consistently. */
const ESTIMATION_METHOD_LABEL_DE: Record<Exclude<VermieterEstimationMethod, "metered">, string> = {
  substitute_own_history: "geschätzt anhand des eigenen Vorjahresverbrauchs (§9a HeizkostenV)",
  substitute_comparable_units: "geschätzt anhand des Durchschnittsverbrauchs vergleichbarer Einheiten (§9a HeizkostenV)",
  substitute_sqm_fallback: "geschätzt nach Wohnfläche, da kein Vergleichswert verfügbar war (§9a HeizkostenV)",
};

/** Detailansicht einer Nebenkostenabrechnung: Zeilen gruppiert je Einheit, Mieter-Salden, Finalisieren-Aktion, PDF-Download (ein PDF pro Abrechnung - siehe routes/statementPdf.ts, kein separates Pro-Mieter-PDF). */
function StatementDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: statement } = useQuery({
    queryKey: ["module-vermieter-statement", workspaceId, id],
    queryFn: () => vermieterApi.statements.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && Boolean(id),
  });
  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: units } = useQuery({
    queryKey: ["module-vermieter-units-all", workspaceId],
    queryFn: () => vermieterApi.units.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => vermieterApi.statements.finalize(workspaceId!, id!),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["module-vermieter-statement", workspaceId, id] }),
  });

  const removeMutation = useMutation({
    mutationFn: () => vermieterApi.statements.remove(workspaceId!, id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-statements", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/abrechnungen`);
    },
  });

  if (!statement) return null;
  const property = properties?.find((p) => p.id === statement.propertyId);

  const linesByUnit = new Map<string, typeof statement.lines>();
  for (const line of statement.lines) {
    const list = linesByUnit.get(line.unitId) ?? [];
    list.push(line);
    linesByUnit.set(line.unitId, list);
  }

  function unitLabel(unitId: string): string {
    return units?.find((u) => u.id === unitId)?.label ?? unitId;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{property?.name}</h1>
          <p className="text-sm text-ink-muted">
            {statement.periodStart} – {statement.periodEnd} · {statement.status === "final" ? "Finalisiert" : "Entwurf"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={vermieterApi.statements.pdfUrl(workspaceId!, id!)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            PDF herunterladen
          </a>
          <a
            href={vermieterApi.statements.exportReceiptsPdfUrl(workspaceId!, id!)}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            Belege für Mieter exportieren (PDF)
          </a>
          {statement.status === "draft" && (
            <>
              <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-sm text-white" onClick={() => finalizeMutation.mutate()}>
                Finalisieren
              </button>
              <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => removeMutation.mutate()}>
                Löschen
              </button>
            </>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-ink">Kostenaufstellung je Einheit</h2>
        {[...linesByUnit.entries()].map(([unitId, lines]) => (
          <div key={unitId} className="overflow-x-auto rounded-lg border border-border">
            <div className="bg-surface-hover px-3 py-2 text-sm font-medium">{unitLabel(unitId)}</div>
            <table className="w-full text-xs">
              <thead className="text-ink-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Kategorie</th>
                  <th className="px-3 py-2 text-left">Umlageschlüssel</th>
                  <th className="px-3 py-2 text-right">Gesamtkosten</th>
                  <th className="px-3 py-2 text-right">Anteil Einheit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-2">{getCostCategory(line.costCategoryKey)?.label ?? line.costCategoryKey}</td>
                    <td className="px-3 py-2">{ALLOCATION_KEY_LABEL_DE[line.allocationKeyUsed]}</td>
                    <td className="px-3 py-2 text-right">{formatCents(line.totalPropertyCostCents)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCents(line.unitShareCents)}
                      {line.isEstimated && (
                        <sup
                          className="ml-0.5 cursor-help text-accent"
                          title={line.estimationMethod && line.estimationMethod !== "metered" ? ESTIMATION_METHOD_LABEL_DE[line.estimationMethod] : "Geschätzter Wert"}
                        >
                          *
                        </sup>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {statement.lines.length === 0 && <p className="text-sm text-ink-muted">Keine Kostenzeilen (keine Belege im Zeitraum?).</p>}
        {statement.lines.some((line) => line.isEstimated) && (
          <div className="space-y-1 rounded-md border border-border/60 bg-surface-hover px-3 py-2 text-xs text-ink-muted">
            <p className="font-medium text-ink">* Geschätzte Verbrauchswerte</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {[...new Set(statement.lines.filter((l) => l.isEstimated && l.estimationMethod).map((l) => l.estimationMethod))].map((method) => (
                <li key={method}>{ESTIMATION_METHOD_LABEL_DE[method as Exclude<VermieterEstimationMethod, "metered">]}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Mieter-Salden</h2>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {statement.tenantSummaries.map((summary) => (
            <li key={summary.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <span className="flex flex-col">
                <span className="font-medium">{unitLabel(summary.unitId)}</span>
                <span className="text-xs text-ink-muted">
                  {summary.segmentStart} – {summary.segmentEnd}
                </span>
              </span>
              <span className="flex flex-col items-end text-xs text-ink-muted">
                <span>Kosten: {formatCents(summary.totalAllocatedCostCents)}</span>
                <span>Vorauszahlungen: {formatCents(summary.totalPrepaymentsCents)}</span>
                <span className={`text-sm font-semibold ${summary.balanceCents > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {summary.balanceCents > 0
                    ? `Nachzahlung: ${formatCents(summary.balanceCents)}`
                    : `Guthaben: ${formatCents(Math.abs(summary.balanceCents))}`}
                </span>
              </span>
            </li>
          ))}
          {statement.tenantSummaries.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Keine Mieter-Salden.</li>}
        </ul>
      </section>
    </div>
  );
}

export { StatementDetailPage };
