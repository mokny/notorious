import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fakturaApi } from "../api.js";

/** Lieferantenliste - reine Stammdaten, kein Bestellprozess in Phase 1. */
function SuppliersListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: suppliers } = useQuery({
    queryKey: ["module-faktura-suppliers", workspaceId],
    queryFn: () => fakturaApi.suppliers.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lieferanten</h1>
        <Link to={`/w/${workspaceId}/modules/faktura/lieferanten/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neuer Lieferant
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {suppliers?.map((supplier) => (
          <li key={supplier.id}>
            <Link
              to={`/w/${workspaceId}/modules/faktura/lieferanten/${supplier.id}`}
              className="group flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <span className="font-medium">{supplier.name}</span>
              <span className="text-xs text-ink-muted">{supplier.city || supplier.country}</span>
            </Link>
          </li>
        ))}
        {suppliers?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Lieferanten angelegt.</li>}
      </ul>
    </div>
  );
}

export { SuppliersListPage };
