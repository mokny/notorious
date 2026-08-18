import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseCentsInput } from "@notorious/shared";
import { vermieterApi, type VermieterAllocationKey } from "../api.js";
import { VERMIETER_COST_CATEGORIES, ALLOCATION_KEY_LABEL_DE, getCostCategory } from "../../db/costCategories.js";
import { useDefaultSingleSelection } from "../hooks/useDefaultSingleSelection.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Beleg erfassen: reine Stammdaten-Eingabe (Immobilie, Betrag, Datum,
 * Kategorie, ...) - Foto/PDF-Erfassung und die manuelle OCR-Texterkennung
 * laufen erst danach auf ReceiptDetailPage gegen die echte Beleg-ID (siehe
 * dessen Doc-Kommentar), statt hier gegen einen noch nicht existierenden
 * Beleg zu buffern. Das entspricht dem bisherigen Ablauf dieser Seite
 * (erst speichern, dann zur Detailseite navigieren) und vermeidet doppelte
 * Dokumenten-Verwaltungs-UI auf beiden Seiten.
 */
function ReceiptCapturePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [propertyId, setPropertyId] = useState("");
  useDefaultSingleSelection(properties, propertyId, setPropertyId);

  const { data: costCircuits } = useQuery({
    queryKey: ["module-vermieter-cost-circuits", workspaceId, propertyId],
    queryFn: () => vermieterApi.costCircuits.list(workspaceId!, propertyId),
    enabled: Boolean(workspaceId) && Boolean(propertyId),
  });

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("0,00");
  const [receiptDate, setReceiptDate] = useState(today());
  const [categoryKey, setCategoryKey] = useState(VERMIETER_COST_CATEGORIES[0]!.key);
  const [allocationOverride, setAllocationOverride] = useState<VermieterAllocationKey | "">("");
  const [description, setDescription] = useState("");
  const [taxDeductible, setTaxDeductible] = useState(true);
  const [costCircuitId, setCostCircuitId] = useState("");

  useEffect(() => {
    // Reset to "use the property's default circuit" whenever the property changes.
    setCostCircuitId("");
  }, [propertyId]);

  const createMutation = useMutation({
    mutationFn: () =>
      vermieterApi.receipts.create(workspaceId!, {
        propertyId,
        costCategoryKey: categoryKey,
        vendor,
        amountCents: parseCentsInput(amount) ?? 0,
        receiptDate,
        description,
        allocationKeyOverride: allocationOverride || null,
        taxDeductible,
        costCircuitId: costCircuitId || null,
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-receipts", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/belege/${saved.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (propertyId && categoryKey && parseCentsInput(amount) && receiptDate) createMutation.mutate();
  }

  const category = getCostCategory(categoryKey);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Beleg erfassen</h1>
      <p className="text-sm text-ink-muted">
        Zuerst die Eckdaten erfassen – Foto/PDF scannen oder hochladen und die Texterkennung starten kannst du direkt danach auf der
        Belegseite.
      </p>

      <label className={labelClass}>
        <span className={labelTextClass}>Immobilie *</span>
        <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">–</option>
          {properties?.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
      </label>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Betrag (€) *</span>
            <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Belegdatum *</span>
            <input type="date" className={inputClass} value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
          </label>
        </div>
        <label className={labelClass}>
          <span className={labelTextClass}>Anbieter/Lieferant</span>
          <input className={inputClass} value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Kostenkategorie *</span>
          <select className={inputClass} value={categoryKey} onChange={(e) => { setCategoryKey(e.target.value); setTaxDeductible(getCostCategory(e.target.value)?.taxDeductibleDefault ?? true); }}>
            {VERMIETER_COST_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          {category && (
            <span className="text-xs text-ink-muted">
              {category.apportionable ? "Umlagefähig" : "Nicht umlagefähig"} · Standard-Umlageschlüssel: {ALLOCATION_KEY_LABEL_DE[category.defaultAllocationKey]}
            </span>
          )}
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Umlageschlüssel überschreiben</span>
          <select className={inputClass} value={allocationOverride} onChange={(e) => setAllocationOverride(e.target.value as VermieterAllocationKey | "")}>
            <option value="">Standard verwenden ({category ? ALLOCATION_KEY_LABEL_DE[category.defaultAllocationKey] : "–"})</option>
            {(Object.keys(ALLOCATION_KEY_LABEL_DE) as VermieterAllocationKey[]).map((key) => (
              <option key={key} value={key}>
                {ALLOCATION_KEY_LABEL_DE[key]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Abrechnungskreis</span>
          <select className={inputClass} value={costCircuitId} onChange={(e) => setCostCircuitId(e.target.value)}>
            <option value="">Gesamtes Objekt (Standard)</option>
            {costCircuits?.filter((c) => !c.isDefault).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-muted">
            Legt fest, welche Einheiten diese Kosten mittragen – wichtig z. B. wenn einzelne Wohnungen einen eigenen
            Durchlauferhitzer haben und nicht am Kreis „Zentralheizung/Warmwasser" beteiligt sind.
          </span>
        </label>
        <label className={labelClass}>
          <span className={labelTextClass}>Beschreibung</span>
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={taxDeductible} onChange={(e) => setTaxDeductible(e.target.checked)} />
          <span>Steuerlich absetzbar (Werbungskosten, unabhängig von der Umlagefähigkeit)</span>
        </label>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={createMutation.isPending || !propertyId} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
            Beleg speichern
          </button>
          {createMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
        </div>
      </form>
    </div>
  );
}

export { ReceiptCapturePage };
