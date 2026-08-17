import { parseCentsInput } from "@notorious/shared";
import type { ProductListItemDto, TaxRateBasisPoints } from "../api.js";

export interface LineForm {
  productId: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  taxRateBasisPoints: TaxRateBasisPoints;
}

export function emptyLine(): LineForm {
  return { productId: "", description: "", quantity: "1", unit: "piece", unitPrice: "0,00", discountPercent: "0", taxRateBasisPoints: 1900 };
}

export function lineFormToInput(line: LineForm) {
  return {
    productId: line.productId || null,
    description: line.description,
    quantity: Number(line.quantity) || 0,
    unit: line.unit,
    unitPriceCents: parseCentsInput(line.unitPrice) ?? 0,
    discountPercent: Number(line.discountPercent) || 0,
    taxRateBasisPoints: line.taxRateBasisPoints,
  };
}

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1 text-sm";

/** Positionseditor für Belege - freie Beschreibung oder Produktauswahl (füllt Preis/Steuersatz vor), Menge, Rabatt. Vorschau-Summen werden clientseitig nur geschätzt; final berechnet ausschließlich der Server bei Speichern/Ausstellen. */
export function DocumentLineEditor(props: {
  lines: LineForm[];
  onChange: (lines: LineForm[]) => void;
  products: ProductListItemDto[] | undefined;
  readOnly?: boolean;
}) {
  const { lines, onChange, products, readOnly } = props;

  function update(index: number, patch: Partial<LineForm>) {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function selectProduct(index: number, productId: string) {
    const product = products?.find((p) => p.id === productId);
    if (!product) {
      update(index, { productId: "" });
      return;
    }
    update(index, {
      productId,
      description: product.name,
      unit: product.unit,
      unitPrice: (product.basePriceCents / 100).toFixed(2).replace(".", ","),
      taxRateBasisPoints: product.taxRateBasisPoints,
    });
  }

  return (
    <div className="space-y-2">
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-12 items-end gap-2 rounded-md border border-border p-2">
          <label className="col-span-3 space-y-1 text-xs">
            <span className="text-ink-muted">Produkt</span>
            <select className={inputClass} value={line.productId} disabled={readOnly} onChange={(e) => selectProduct(index, e.target.value)}>
              <option value="">Freitext</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-3 space-y-1 text-xs">
            <span className="text-ink-muted">Beschreibung</span>
            <input className={inputClass} disabled={readOnly} value={line.description} onChange={(e) => update(index, { description: e.target.value })} />
          </label>
          <label className="col-span-1 space-y-1 text-xs">
            <span className="text-ink-muted">Menge</span>
            <input className={inputClass} disabled={readOnly} value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} />
          </label>
          <label className="col-span-2 space-y-1 text-xs">
            <span className="text-ink-muted">Einzelpreis (€)</span>
            <input className={inputClass} disabled={readOnly} value={line.unitPrice} onChange={(e) => update(index, { unitPrice: e.target.value })} />
          </label>
          <label className="col-span-1 space-y-1 text-xs">
            <span className="text-ink-muted">Rabatt %</span>
            <input
              className={inputClass}
              disabled={readOnly}
              value={line.discountPercent}
              onChange={(e) => update(index, { discountPercent: e.target.value })}
            />
          </label>
          <label className="col-span-1 space-y-1 text-xs">
            <span className="text-ink-muted">USt.</span>
            <select
              className={inputClass}
              disabled={readOnly}
              value={line.taxRateBasisPoints}
              onChange={(e) => update(index, { taxRateBasisPoints: Number(e.target.value) as TaxRateBasisPoints })}
            >
              <option value={1900}>19%</option>
              <option value={700}>7%</option>
              <option value={0}>0%</option>
            </select>
          </label>
          {!readOnly && (
            <button type="button" className="col-span-1 text-xs text-red-500" onClick={() => onChange(lines.filter((_, i) => i !== index))}>
              Entfernen
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button type="button" className="text-xs text-accent" onClick={() => onChange([...lines, emptyLine()])}>
          + Position
        </button>
      )}
    </div>
  );
}
