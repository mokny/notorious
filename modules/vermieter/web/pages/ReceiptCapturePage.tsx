import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseCentsInput } from "@notorious/shared";
import { vermieterApi, type ReceiptOcrResult, type VermieterAllocationKey } from "../api.js";
import { VERMIETER_COST_CATEGORIES, ALLOCATION_KEY_LABEL_DE, getCostCategory } from "../../db/costCategories.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Beleg erfassen: Foto hochladen -> OCR-Endpunkt liefert einen Guess
 * (persistiert nichts) -> Review-Formular mit editierbaren, vom Guess
 * vorbelegten Feldern -> POST erstellt den eigentlichen Beleg. Zwei-Schritt-
 * Fluss passend zum Backend-Design (siehe modules/vermieter/routes/receipts.ts).
 */
function ReceiptCapturePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [propertyId, setPropertyId] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<ReceiptOcrResult | null>(null);

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("0,00");
  const [receiptDate, setReceiptDate] = useState(today());
  const [categoryKey, setCategoryKey] = useState(VERMIETER_COST_CATEGORIES[0]!.key);
  const [allocationOverride, setAllocationOverride] = useState<VermieterAllocationKey | "">("");
  const [description, setDescription] = useState("");
  const [taxDeductible, setTaxDeductible] = useState(true);

  const ocrMutation = useMutation({
    mutationFn: (file: File) => vermieterApi.receipts.ocr(workspaceId!, file, propertyId || undefined),
    onSuccess: (result) => {
      setOcrResult(result);
      if (result.guessedAmountCents != null) setAmount((result.guessedAmountCents / 100).toFixed(2).replace(".", ","));
      if (result.guessedDate) setReceiptDate(result.guessedDate);
      if (result.guessedVendor) setVendor(result.guessedVendor);
    },
  });

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
        storagePath: ocrResult?.storagePath ?? null,
        ocrRawText: ocrResult?.rawText ?? null,
        taxDeductible,
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-vermieter-receipts", workspaceId] });
      navigate(`/w/${workspaceId}/modules/vermieter/belege/${saved.id}`);
    },
  });

  function handleFileSelected(file: File) {
    setPhotoPreviewUrl(URL.createObjectURL(file));
    ocrMutation.mutate(file);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (propertyId && categoryKey && parseCentsInput(amount) && receiptDate) createMutation.mutate();
  }

  const category = getCostCategory(categoryKey);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Beleg erfassen</h1>

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

      {!photoPreviewUrl && (
        <div className="rounded-md border border-dashed border-border p-6 text-center">
          <button type="button" className="rounded-md bg-accent px-4 py-2 text-sm text-white" onClick={() => fileInputRef.current?.click()}>
            Foto auswählen
          </button>
          <p className="mt-2 text-xs text-ink-muted">Der Beleg wird per lokaler Texterkennung (OCR) vorausgefüllt – bitte anschließend prüfen.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {photoPreviewUrl && (
        <div className="flex gap-4">
          <img src={photoPreviewUrl} alt="Beleg" className="h-40 w-32 shrink-0 rounded-md border border-border object-cover" />
          <div className="flex-1 space-y-2">
            {ocrMutation.isPending && <p className="text-sm text-ink-muted">Texterkennung läuft…</p>}
            {ocrMutation.isSuccess && <p className="text-sm text-ink-muted">Texterkennung abgeschlossen – bitte Felder unten prüfen.</p>}
            {ocrMutation.isError && <p className="text-sm text-red-500">Texterkennung fehlgeschlagen – bitte Felder manuell ausfüllen.</p>}
            <button type="button" className="text-xs text-accent" onClick={() => fileInputRef.current?.click()}>
              Anderes Foto wählen
            </button>
          </div>
        </div>
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
