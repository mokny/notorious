import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { fakturaApi, type ProductInput, type ProductUnit, type TaxRateBasisPoints } from "../api.js";
import { autoProductColor } from "../lib/posColor.js";

interface TierForm {
  minQuantity: string;
  price: string;
}

interface CustomerPriceForm {
  customerId: string;
  price: string;
  effectiveFrom: string;
}

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const today = () => new Date().toISOString().slice(0, 10);

/** Anlegen/Bearbeiten eines Produkts inkl. Staffelpreisen und kundenspezifischen Preisen. `:id === "neu"` -> Anlage-Modus. */
function ProductDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: product } = useQuery({
    queryKey: ["module-faktura-product", workspaceId, id],
    queryFn: () => fakturaApi.products.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: customers } = useQuery({
    queryKey: ["module-faktura-customers", workspaceId],
    queryFn: () => fakturaApi.customers.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("piece");
  const [unitLabel, setUnitLabel] = useState("");
  const [basePrice, setBasePrice] = useState("0,00");
  const [taxRate, setTaxRate] = useState<TaxRateBasisPoints>(1900);
  const [sku, setSku] = useState("");
  const [posEnabled, setPosEnabled] = useState(false);
  const [posCategory, setPosCategory] = useState("");
  const [posFavorite, setPosFavorite] = useState(false);
  const [posColor, setPosColor] = useState("");
  const [tiers, setTiers] = useState<TierForm[]>([]);
  const [customerPrices, setCustomerPrices] = useState<CustomerPriceForm[]>([]);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description);
      setUnit(product.unit);
      setUnitLabel(product.unitLabel);
      setBasePrice((product.basePriceCents / 100).toFixed(2).replace(".", ","));
      setTaxRate(product.taxRateBasisPoints);
      setSku(product.sku);
      setPosEnabled(product.posEnabled);
      setPosCategory(product.posCategory);
      setPosFavorite(product.posFavorite);
      setPosColor(product.posColor);
      setTiers(product.priceTiers.map((t) => ({ minQuantity: String(t.minQuantity), price: (t.priceCents / 100).toFixed(2).replace(".", ",") })));
      setCustomerPrices(
        product.customerPrices.map((p) => ({ customerId: p.customerId, price: (p.priceCents / 100).toFixed(2).replace(".", ","), effectiveFrom: p.effectiveFrom.slice(0, 10) })),
      );
    }
  }, [product]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const basePriceCents = parseCentsInput(basePrice) ?? 0;
      const input: ProductInput = {
        name,
        description,
        unit,
        unitLabel,
        basePriceCents,
        taxRateBasisPoints: taxRate,
        sku,
        posEnabled,
        posCategory,
        posFavorite,
        posColor,
        priceTiers: tiers
          .filter((t) => t.minQuantity.trim())
          .map((t) => ({ minQuantity: Number(t.minQuantity), priceCents: parseCentsInput(t.price) ?? 0 })),
        customerPrices: customerPrices
          .filter((p) => p.customerId)
          .map((p) => ({ customerId: p.customerId, priceCents: parseCentsInput(p.price) ?? 0, effectiveFrom: p.effectiveFrom || today() })),
      };
      return isNew ? fakturaApi.products.create(workspaceId!, input) : fakturaApi.products.update(workspaceId!, id!, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-products", workspaceId] });
      navigate(`/w/${workspaceId}/modules/faktura/produkte/${saved.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) saveMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">{isNew ? "Neues Produkt" : name || "Produkt bearbeiten"}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Name *</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Beschreibung</span>
            <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="grid grid-cols-4 gap-3">
            <label className={labelClass}>
              <span className={labelTextClass}>Einheit</span>
              <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}>
                <option value="piece">Stück</option>
                <option value="hour">Stunde</option>
                <option value="day">Tag</option>
                <option value="flat">Pauschal</option>
                <option value="kg">kg</option>
                <option value="custom">Individuell</option>
              </select>
            </label>
            {unit === "custom" && (
              <label className={labelClass}>
                <span className={labelTextClass}>Einheit (frei)</span>
                <input className={inputClass} value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} />
              </label>
            )}
            <label className={labelClass}>
              <span className={labelTextClass}>Preis (netto, €)</span>
              <input className={inputClass} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>USt.-Satz</span>
              <select className={inputClass} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) as TaxRateBasisPoints)}>
                <option value={1900}>19%</option>
                <option value={700}>7%</option>
                <option value={0}>0%</option>
              </select>
            </label>
          </div>
          <label className={labelClass}>
            <span className={labelTextClass}>SKU / Artikelnummer</span>
            <input className={inputClass} value={sku} onChange={(e) => setSku(e.target.value)} />
          </label>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Kasse</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={posEnabled} onChange={(e) => setPosEnabled(e.target.checked)} />
            <span>Am Kassen-Terminal anzeigen</span>
          </label>
          {posEnabled && (
            <>
              <label className={labelClass}>
                <span className={labelTextClass}>Kassen-Kategorie</span>
                <input className={inputClass} value={posCategory} onChange={(e) => setPosCategory(e.target.value)} placeholder="z. B. Getränke" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={posFavorite} onChange={(e) => setPosFavorite(e.target.checked)} />
                <span>Als Favorit anheften (eigener "Favoriten"-Reiter an der Kasse)</span>
              </label>
              <div className="flex items-center gap-3">
                <label className={labelClass}>
                  <span className={labelTextClass}>Kachel-Farbe</span>
                  <input
                    type="color"
                    className="h-9 w-16 rounded-md border border-border bg-surface"
                    value={posColor || autoProductColor(id ?? "neu")}
                    onChange={(e) => setPosColor(e.target.value)}
                  />
                </label>
                {posColor && (
                  <button type="button" className="text-xs text-accent" onClick={() => setPosColor("")}>
                    Automatisch (Standard)
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Staffelpreise (ab Menge)</h2>
            <button type="button" className="text-xs text-accent" onClick={() => setTiers((prev) => [...prev, { minQuantity: "", price: "0,00" }])}>
              + Staffel
            </button>
          </div>
          {tiers.map((tier, index) => (
            <div key={index} className="grid grid-cols-3 items-end gap-2">
              <label className={labelClass}>
                <span className={labelTextClass}>Ab Menge</span>
                <input
                  className={inputClass}
                  value={tier.minQuantity}
                  onChange={(e) => setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, minQuantity: e.target.value } : t)))}
                />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Preis (€)</span>
                <input
                  className={inputClass}
                  value={tier.price}
                  onChange={(e) => setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, price: e.target.value } : t)))}
                />
              </label>
              <button type="button" className="text-xs text-red-500" onClick={() => setTiers((prev) => prev.filter((_, i) => i !== index))}>
                Entfernen
              </button>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Kundenspezifische Preise</h2>
            <button
              type="button"
              className="text-xs text-accent"
              onClick={() => setCustomerPrices((prev) => [...prev, { customerId: "", price: "0,00", effectiveFrom: today() }])}
            >
              + Kundenpreis
            </button>
          </div>
          {customerPrices.map((cp, index) => (
            <div key={index} className="grid grid-cols-4 items-end gap-2">
              <label className={labelClass}>
                <span className={labelTextClass}>Kunde</span>
                <select
                  className={inputClass}
                  value={cp.customerId}
                  onChange={(e) => setCustomerPrices((prev) => prev.map((p, i) => (i === index ? { ...p, customerId: e.target.value } : p)))}
                >
                  <option value="">–</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Preis (€)</span>
                <input
                  className={inputClass}
                  value={cp.price}
                  onChange={(e) => setCustomerPrices((prev) => prev.map((p, i) => (i === index ? { ...p, price: e.target.value } : p)))}
                />
              </label>
              <label className={labelClass}>
                <span className={labelTextClass}>Gültig ab</span>
                <input
                  type="date"
                  className={inputClass}
                  value={cp.effectiveFrom}
                  onChange={(e) => setCustomerPrices((prev) => prev.map((p, i) => (i === index ? { ...p, effectiveFrom: e.target.value } : p)))}
                />
              </label>
              <button type="button" className="text-xs text-red-500" onClick={() => setCustomerPrices((prev) => prev.filter((_, i) => i !== index))}>
                Entfernen
              </button>
            </div>
          ))}
        </section>

        {product && product.priceHistory.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Preishistorie</h2>
            <ul className="space-y-1 text-xs text-ink-muted">
              {product.priceHistory.map((entry, index) => (
                <li key={index}>
                  {entry.effectiveFrom.slice(0, 10)}: {formatCents(entry.priceCents)}
                  {entry.customerId ? " (kundenspezifisch)" : " (Standardpreis)"}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Speichern
          </button>
          {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>
    </div>
  );
}

export { ProductDetailPage };
