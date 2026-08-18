import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { vermieterApi } from "../api.js";
import { getCostCategory } from "../../db/costCategories.js";
import { useDefaultSingleSelection } from "../hooks/useDefaultSingleSelection.js";

const inputClass = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

/** Steuerübersicht (Anlage-V-Vorbereitung): Immobilie + Jahr -> Einnahmen/Werbungskosten/AfA-Aufstellung mit Gewinn/Verlust, PDF-/CSV-Export. */
function TaxOverviewPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [propertyId, setPropertyId] = useState("");
  useDefaultSingleSelection(properties, propertyId, setPropertyId);
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: overview } = useQuery({
    queryKey: ["module-vermieter-tax-overview", workspaceId, propertyId, year],
    queryFn: () => vermieterApi.taxOverview.get(workspaceId!, propertyId, year),
    enabled: Boolean(workspaceId) && Boolean(propertyId),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Steuerübersicht</h1>

      <div className="flex gap-3">
        <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Immobilie wählen</option>
          {properties?.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
        <input type="number" className={inputClass} value={year} onChange={(e) => setYear(Number(e.target.value))} />
      </div>

      {overview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-4 text-sm">
            <span className="text-ink-muted">Mieteinnahmen (Kaltmiete, tatsächlich vereinnahmt)</span>
            <span className="text-right font-medium">{formatCents(overview.rentIncomeCents)}</span>
            <span className="text-ink-muted">Werbungskosten (absetzbare Belege)</span>
            <span className="text-right font-medium">− {formatCents(overview.deductibleExpensesCents)}</span>
            <span className="text-ink-muted">AfA ({overview.afaRatePercent}% p.a., §7 EStG)</span>
            <span className="text-right font-medium">− {formatCents(overview.afaCents)}</span>
            <span className="border-t border-border pt-2 font-semibold text-ink">
              {overview.netResultCents >= 0 ? "Gewinn" : "Verlust"}
            </span>
            <span
              className={`border-t border-border pt-2 text-right text-base font-semibold ${
                overview.netResultCents >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {formatCents(overview.netResultCents)}
            </span>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Werbungskosten nach Kategorie</h2>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {overview.expensesByCategoryKey.map((entry) => (
                <li key={entry.costCategoryKey} className="flex items-center justify-between px-3 py-2">
                  <span>{getCostCategory(entry.costCategoryKey)?.label ?? entry.costCategoryKey}</span>
                  <span>{formatCents(entry.amountCents)}</span>
                </li>
              ))}
              {overview.expensesByCategoryKey.length === 0 && <li className="px-3 py-2 text-ink-muted">Keine absetzbaren Belege im Jahr.</li>}
            </ul>
          </section>

          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            {overview.simplificationNote}
          </p>

          <div className="flex gap-2">
            <a
              href={vermieterApi.taxOverview.pdfUrl(workspaceId!, propertyId, year)}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              PDF herunterladen
            </a>
            <a href={vermieterApi.taxOverview.csvUrl(workspaceId!, propertyId, year)} className="rounded-md border border-border px-3 py-1.5 text-sm">
              CSV herunterladen
            </a>
          </div>
        </div>
      )}
      {!propertyId && <p className="text-sm text-ink-muted">Bitte eine Immobilie wählen.</p>}
    </div>
  );
}

export { TaxOverviewPage };
