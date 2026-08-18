import { useState, type FormEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vermieterApi } from "../api.js";
import { RemindersBanner } from "../components/RemindersBanner.js";
import { useDefaultSingleSelection } from "../hooks/useDefaultSingleSelection.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

/** Jan 1 / Dec 31 of the calendar year before the current one - a Nebenkostenabrechnung is almost always for the just-finished year, so this is the sensible default for a freshly-opened "Abrechnung erstellen" form rather than leaving the period empty. */
function defaultPreviousYearPeriod(): { start: string; end: string } {
  const previousYear = new Date().getFullYear() - 1;
  return { start: `${previousYear}-01-01`, end: `${previousYear}-12-31` };
}

/** Liste aller Nebenkostenabrechnungen + "Abrechnung erstellen"-Formular (Immobilie + Zeitraum -> generiert Statement per POST). */
function StatementsListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [filterPropertyId, setFilterPropertyId] = useState("");
  const { data: statements } = useQuery({
    queryKey: ["module-vermieter-statements", workspaceId, filterPropertyId],
    queryFn: () => vermieterApi.statements.list(workspaceId!, filterPropertyId || undefined),
    enabled: Boolean(workspaceId),
  });

  const [showForm, setShowForm] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  useDefaultSingleSelection(properties, propertyId, setPropertyId);
  const [periodStart, setPeriodStart] = useState(() => defaultPreviousYearPeriod().start);
  const [periodEnd, setPeriodEnd] = useState(() => defaultPreviousYearPeriod().end);
  const [heatingShare, setHeatingShare] = useState(70);

  const generateMutation = useMutation({
    mutationFn: () => vermieterApi.statements.generate(workspaceId!, { propertyId, periodStart, periodEnd, heatingConsumptionSharePercent: heatingShare }),
    onSuccess: (statement) => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-statements", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/abrechnungen/${statement.id}`);
    },
  });

  function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (propertyId && periodStart && periodEnd) generateMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      {workspaceId && <RemindersBanner workspaceId={workspaceId} />}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Nebenkostenabrechnungen</h1>
        <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-sm text-white" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Abbrechen" : "Abrechnung erstellen"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleGenerate} className="space-y-3 rounded-md border border-border p-4">
          <label className={labelClass}>
            <span className={labelTextClass}>Immobilie *</span>
            <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
              <option value="">–</option>
              {properties?.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Zeitraum von *</span>
              <input type="date" className={inputClass} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Zeitraum bis *</span>
              <input type="date" className={inputClass} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Heizkosten-Verbrauchsanteil (%)</span>
              <input
                type="number"
                min={50}
                max={100}
                className={inputClass}
                value={heatingShare}
                onChange={(e) => setHeatingShare(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="text-xs text-ink-muted">Nach HeizkostenV §7 muss der Verbrauchsanteil zwischen 50% und 100% liegen (Rest wird nach Fläche verteilt).</p>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={generateMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
              Abrechnung generieren
            </button>
            {generateMutation.isError && <span className="text-xs text-red-500">Fehler bei der Generierung.</span>}
          </div>
        </form>
      )}

      <select className={inputClass} value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)}>
        <option value="">Alle Immobilien</option>
        {properties?.map((property) => (
          <option key={property.id} value={property.id}>
            {property.name}
          </option>
        ))}
      </select>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {statements?.map((statement) => {
          const property = properties?.find((p) => p.id === statement.propertyId);
          return (
            <li key={statement.id}>
              <Link
                to={`/w/${workspaceId}/modules/vermieter/abrechnungen/${statement.id}`}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
              >
                <span className="font-medium">{property?.name ?? statement.propertyId}</span>
                <span className="flex items-center gap-3 text-xs text-ink-muted">
                  <span>
                    {statement.periodStart} – {statement.periodEnd}
                  </span>
                  <span>{statement.status === "final" ? "Finalisiert" : "Entwurf"}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {statements?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Abrechnungen erstellt.</li>}
      </ul>
    </div>
  );
}

export { StatementsListPage };
