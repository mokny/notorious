import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { vermieterApi, type ReceiptInput, type VermieterAllocationKey } from "../api.js";
import { VERMIETER_COST_CATEGORIES, ALLOCATION_KEY_LABEL_DE, getCostCategory } from "../../db/costCategories.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

/** Ansicht/Bearbeitung eines bereits erfassten Belegs (Neuanlage läuft über ReceiptCapturePage's OCR-Flow). */
function ReceiptDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: receipt } = useQuery({
    queryKey: ["module-vermieter-receipt", workspaceId, id],
    queryFn: () => vermieterApi.receipts.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && Boolean(id),
  });
  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("0,00");
  const [receiptDate, setReceiptDate] = useState("");
  const [categoryKey, setCategoryKey] = useState(VERMIETER_COST_CATEGORIES[0]!.key);
  const [allocationOverride, setAllocationOverride] = useState<VermieterAllocationKey | "">("");
  const [description, setDescription] = useState("");
  const [taxDeductible, setTaxDeductible] = useState(true);

  useEffect(() => {
    if (receipt) {
      setVendor(receipt.vendor);
      setAmount((receipt.amountCents / 100).toFixed(2).replace(".", ","));
      setReceiptDate(receipt.receiptDate);
      setCategoryKey(receipt.costCategoryKey);
      setAllocationOverride(receipt.allocationKeyOverride ?? "");
      setDescription(receipt.description);
      setTaxDeductible(receipt.taxDeductible);
    }
  }, [receipt]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const input: Partial<ReceiptInput> = {
        vendor,
        amountCents: parseCentsInput(amount) ?? 0,
        receiptDate,
        costCategoryKey: categoryKey,
        allocationKeyOverride: allocationOverride || null,
        description,
        taxDeductible,
      };
      return vermieterApi.receipts.update(workspaceId!, id!, input);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["module-vermieter-receipt", workspaceId, id] }),
  });

  const removeMutation = useMutation({
    mutationFn: () => vermieterApi.receipts.remove(workspaceId!, id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-receipts", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/belege`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveMutation.mutate();
  }

  const property = properties?.find((p) => p.id === receipt?.propertyId);
  const category = getCostCategory(categoryKey);

  if (!receipt) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {receipt.vendor || category?.label} · {formatCents(receipt.amountCents)}
        </h1>
        <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => removeMutation.mutate()}>
          Löschen
        </button>
      </div>
      <p className="text-sm text-ink-muted">{property?.name}</p>

      {receipt.storagePath && (
        <img src={vermieterApi.receipts.photoUrl(workspaceId!, id!)} alt="Beleg" className="max-h-80 rounded-md border border-border object-contain" />
      )}

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
          <select className={inputClass} value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)}>
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
          <span className={labelTextClass}>Beschreibung</span>
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={taxDeductible} onChange={(e) => setTaxDeductible(e.target.checked)} />
          <span>Steuerlich absetzbar</span>
        </label>

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

export { ReceiptDetailPage };
