import { useMemo, useState } from "react";
import { formatCents } from "@notorious/shared";
import type { ProductListItemDto } from "../api.js";

const UNCATEGORIZED = "Sonstiges";

/** Kategorie-Kacheln + große Touch-Produkt-Buttons für den Kassenbildschirm - siehe web/pages/PosTerminalPage.tsx. */
export function PosProductGrid(props: { products: ProductListItemDto[]; onAdd: (product: ProductListItemDto) => void }) {
  const categories = useMemo(() => {
    const set = new Set(props.products.map((p) => p.posCategory || UNCATEGORIZED));
    return Array.from(set).sort();
  }, [props.products]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const effectiveCategory = activeCategory ?? categories[0] ?? null;
  const visibleProducts = props.products.filter((p) => (p.posCategory || UNCATEGORIZED) === effectiveCategory);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              category === effectiveCategory ? "bg-accent text-white" : "bg-surface-hover text-ink"
            }`}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="mt-3 grid flex-1 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
        {visibleProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => props.onAdd(product)}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-surface p-4 text-center active:bg-surface-hover"
          >
            <span className="text-sm font-medium">{product.name}</span>
            <span className="text-xs text-ink-muted">{formatCents(product.basePriceCents)}</span>
          </button>
        ))}
        {visibleProducts.length === 0 && <p className="col-span-full py-8 text-center text-sm text-ink-muted">Keine Produkte in dieser Kategorie.</p>}
      </div>
    </div>
  );
}
