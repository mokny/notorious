import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi } from "../api.js";

const unitLabel: Record<string, string> = { piece: "Stück", hour: "Stunde", day: "Tag", flat: "Pauschal", kg: "kg", custom: "individuell" };

/** Produkt-/Dienstleistungsliste des Faktura-Moduls. */
function ProductsListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: products } = useQuery({
    queryKey: ["module-faktura-products", workspaceId],
    queryFn: () => fakturaApi.products.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Produkte &amp; Dienstleistungen</h1>
        <Link to={`/w/${workspaceId}/modules/faktura/produkte/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neues Produkt
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {products?.map((product) => (
          <li key={product.id}>
            <Link
              to={`/w/${workspaceId}/modules/faktura/produkte/${product.id}`}
              className="group flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <span className="font-medium">{product.name}</span>
              <span className="flex items-center gap-3 text-xs text-ink-muted">
                <span>{formatCents(product.basePriceCents)}</span>
                <span>/ {unitLabel[product.unit]}</span>
                <span>{(product.taxRateBasisPoints / 100).toFixed(0)}% USt.</span>
              </span>
            </Link>
          </li>
        ))}
        {products?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Produkte angelegt.</li>}
      </ul>
    </div>
  );
}

export { ProductsListPage };
