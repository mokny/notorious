import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { vermieterApi } from "../api.js";
import { useVermieterCostCategories } from "../hooks/useVermieterCostCategories.js";

const inputClass = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

/** Liste aller Belege, filterbar nach Immobilie/Kategorie/Jahr. */
function ReceiptsListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [propertyId, setPropertyId] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [year, setYear] = useState("");
  const { categories, getCategoryLabel } = useVermieterCostCategories(workspaceId);

  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: receipts } = useQuery({
    queryKey: ["module-vermieter-receipts", workspaceId, propertyId, year],
    queryFn: () =>
      vermieterApi.receipts.list(workspaceId!, {
        propertyId: propertyId || undefined,
        from: year ? `${year}-01-01` : undefined,
        to: year ? `${year}-12-31` : undefined,
      }),
    enabled: Boolean(workspaceId),
  });

  const filtered = (receipts ?? []).filter((r) => !categoryKey || r.costCategoryKey === categoryKey);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Belege</h1>
        <Link to={`/w/${workspaceId}/modules/vermieter/belege/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Beleg erfassen
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Alle Immobilien</option>
          {properties?.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
        <select className={inputClass} value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {categories.map((category) => (
            <option key={category.key} value={category.key}>
              {category.label}
            </option>
          ))}
        </select>
        <input className={inputClass} placeholder="Jahr" value={year} onChange={(e) => setYear(e.target.value)} />
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {filtered.map((receipt) => (
          <li key={receipt.id}>
            <Link
              to={`/w/${workspaceId}/modules/vermieter/belege/${receipt.id}`}
              className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <span className="flex flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {receipt.vendor || getCategoryLabel(receipt.costCategoryKey)}
                  {receipt.type === "credit" && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-normal text-green-800 dark:bg-green-950 dark:text-green-300">
                      Gutschrift
                    </span>
                  )}
                </span>
                <span className="text-xs text-ink-muted">{getCategoryLabel(receipt.costCategoryKey)}</span>
              </span>
              <span className="flex items-center gap-3 text-xs text-ink-muted">
                <span>{receipt.receiptDate}</span>
                <span className={`font-medium ${receipt.type === "credit" ? "text-green-700 dark:text-green-400" : "text-ink"}`}>
                  {receipt.type === "credit" ? "− " : ""}
                  {formatCents(receipt.amountCents)}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Keine Belege gefunden.</li>}
      </ul>
    </div>
  );
}

export { ReceiptsListPage };
