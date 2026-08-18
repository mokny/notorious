import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents, parseCentsInput } from "@notorious/shared";
import { vermieterApi, type ReceiptDocumentDto, type ReceiptDocumentOcrResult, type ReceiptInput, type VermieterAllocationKey } from "../api.js";
import { VERMIETER_COST_CATEGORIES, ALLOCATION_KEY_LABEL_DE, getCostCategory } from "../../db/costCategories.js";

const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

const OCR_STATUS_LABEL_DE: Record<ReceiptDocumentDto["ocrStatus"], string> = {
  none: "Keine Texterkennung",
  pending: "Texterkennung läuft…",
  done: "Texterkennung abgeschlossen",
  failed: "Texterkennung fehlgeschlagen",
};

const OCR_STATUS_CLASS: Record<ReceiptDocumentDto["ocrStatus"], string> = {
  none: "bg-surface-hover text-ink-muted",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

interface PendingPage {
  file: File;
  previewUrl: string;
}

/**
 * Ansicht/Bearbeitung eines bereits erfassten Belegs, inkl. Dokumenten-
 * Verwaltung (item 3): "Scannen" sammelt einzeln aufgenommene Kamerafotos
 * clientseitig in `pendingPages` und kombiniert sie erst auf Knopfdruck
 * server-seitig zu einem mehrseitigen PDF-Dokument
 * (POST .../documents/combine-pages) - der `<input capture>` liefert pro
 * Aufruf nur ein Bild, daher der Sammel-Schritt. "Hochladen" lädt jede
 * gewählte Datei einzeln als eigenständiges Dokument hoch (schon fertige
 * Dateien, keine zu kombinierenden Seiten). OCR läuft nie automatisch beim
 * Hochladen - immer erst per "OCR starten"-Button pro Dokument, dessen
 * Ergebnis als Vorschlag angezeigt wird und explizit über "Übernehmen"-
 * Buttons in die Formularfelder unten übernommen werden muss.
 */
function ReceiptDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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
  const { data: costCircuits } = useQuery({
    queryKey: ["module-vermieter-cost-circuits", workspaceId, receipt?.propertyId],
    queryFn: () => vermieterApi.costCircuits.list(workspaceId!, receipt!.propertyId),
    enabled: Boolean(workspaceId) && Boolean(receipt?.propertyId),
  });
  const documentsQueryKey = ["module-vermieter-receipt-documents", workspaceId, id];
  const { data: documents } = useQuery({
    queryKey: documentsQueryKey,
    queryFn: () => vermieterApi.receiptDocuments.list(workspaceId!, id!),
    enabled: Boolean(workspaceId) && Boolean(id),
  });

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("0,00");
  const [receiptDate, setReceiptDate] = useState("");
  const [categoryKey, setCategoryKey] = useState(VERMIETER_COST_CATEGORIES[0]!.key);
  const [allocationOverride, setAllocationOverride] = useState<VermieterAllocationKey | "">("");
  const [description, setDescription] = useState("");
  const [taxDeductible, setTaxDeductible] = useState(true);
  const [costCircuitId, setCostCircuitId] = useState("");

  useEffect(() => {
    if (receipt) {
      setVendor(receipt.vendor);
      setAmount((receipt.amountCents / 100).toFixed(2).replace(".", ","));
      setReceiptDate(receipt.receiptDate);
      setCategoryKey(receipt.costCategoryKey);
      setAllocationOverride(receipt.allocationKeyOverride ?? "");
      setDescription(receipt.description);
      setTaxDeductible(receipt.taxDeductible);
      setCostCircuitId(receipt.costCircuitId);
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
        costCircuitId: costCircuitId || null,
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

  // --- Dokumente: Scannen (Seiten sammeln -> kombinieren) & Hochladen -----

  const [pendingPages, setPendingPages] = useState<PendingPage[]>([]);

  function addScannedPage(file: File) {
    setPendingPages((prev) => [...prev, { file, previewUrl: URL.createObjectURL(file) }]);
  }

  function removePendingPage(index: number) {
    setPendingPages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  const combinePagesMutation = useMutation({
    mutationFn: () => vermieterApi.receiptDocuments.combinePages(workspaceId!, id!, pendingPages.map((p) => p.file)),
    onSuccess: () => {
      for (const page of pendingPages) URL.revokeObjectURL(page.previewUrl);
      setPendingPages([]);
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => Promise.all(files.map((file) => vermieterApi.receiptDocuments.upload(workspaceId!, id!, file))),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: documentsQueryKey }),
  });

  const removeDocumentMutation = useMutation({
    mutationFn: (documentId: string) => vermieterApi.receiptDocuments.remove(workspaceId!, id!, documentId),
    onSuccess: (_result, documentId) => {
      setGuesses((prev) => {
        const next = { ...prev };
        delete next[documentId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
  });

  // --- OCR: manueller Trigger je Dokument + Vorschlags-Review -------------

  const [guesses, setGuesses] = useState<Record<string, ReceiptDocumentOcrResult>>({});
  const [ocrDocumentId, setOcrDocumentId] = useState<string | null>(null);

  const ocrMutation = useMutation({
    mutationFn: (documentId: string) => {
      setOcrDocumentId(documentId);
      return vermieterApi.receiptDocuments.triggerOcr(workspaceId!, id!, documentId);
    },
    onSuccess: (result, documentId) => {
      setGuesses((prev) => ({ ...prev, [documentId]: result }));
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey });
    },
    onSettled: () => setOcrDocumentId(null),
  });

  function applyGuessedAmount(result: ReceiptDocumentOcrResult) {
    if (result.guessedAmountCents != null) setAmount((result.guessedAmountCents / 100).toFixed(2).replace(".", ","));
  }
  function applyGuessedDate(result: ReceiptDocumentOcrResult) {
    if (result.guessedDate) setReceiptDate(result.guessedDate);
  }
  function applyGuessedVendor(result: ReceiptDocumentOcrResult) {
    if (result.guessedVendor) setVendor(result.guessedVendor);
  }
  function applyAllGuessed(result: ReceiptDocumentOcrResult) {
    applyGuessedAmount(result);
    applyGuessedDate(result);
    applyGuessedVendor(result);
  }

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
        <img src={vermieterApi.receipts.photoUrl(workspaceId!, id!)} alt="Beleg (alt)" className="max-h-80 rounded-md border border-border object-contain" />
      )}

      {/* --- Dokumente ------------------------------------------------- */}
      <section className="space-y-3 rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold text-ink">Dokumente</h2>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-md bg-accent px-3 py-1.5 text-sm text-white" onClick={() => scanInputRef.current?.click()}>
            {pendingPages.length > 0 ? "Weitere Seite scannen" : "Scannen"}
          </button>
          <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => uploadInputRef.current?.click()}>
            Hochladen
          </button>
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addScannedPage(file);
              e.target.value = "";
            }}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) uploadMutation.mutate(files);
              e.target.value = "";
            }}
          />
          {uploadMutation.isPending && <span className="text-xs text-ink-muted">Wird hochgeladen…</span>}
          {uploadMutation.isError && <span className="text-xs text-red-500">Upload fehlgeschlagen.</span>}
        </div>

        {pendingPages.length > 0 && (
          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <p className="text-xs text-ink-muted">{pendingPages.length} gescannte Seite(n) – noch nicht gespeichert.</p>
            <div className="flex flex-wrap gap-2">
              {pendingPages.map((page, index) => (
                <div key={page.previewUrl} className="relative">
                  <img src={page.previewUrl} alt={`Seite ${index + 1}`} className="h-20 w-16 rounded border border-border object-cover" />
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white"
                    onClick={() => removePendingPage(index)}
                    aria-label="Seite entfernen"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={combinePagesMutation.isPending}
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() => combinePagesMutation.mutate()}
              >
                {combinePagesMutation.isPending ? "Wird gespeichert…" : "Fertig – als Dokument speichern"}
              </button>
              {combinePagesMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
            </div>
          </div>
        )}

        <ul className="divide-y divide-border rounded-md border border-border">
          {documents?.map((doc) => {
            const guess = guesses[doc.id];
            return (
              <li key={doc.id} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={vermieterApi.receiptDocuments.fileUrl(workspaceId!, id!, doc.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm hover:underline"
                  >
                    {doc.mimeType.startsWith("image/") ? (
                      <img
                        src={vermieterApi.receiptDocuments.fileUrl(workspaceId!, id!, doc.id)}
                        alt={doc.originalFilename}
                        className="h-10 w-10 rounded border border-border object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded border border-border text-xs text-ink-muted">PDF</span>
                    )}
                    <span>
                      {doc.originalFilename}
                      {doc.pageCount ? ` (${doc.pageCount} Seiten)` : ""}
                    </span>
                  </a>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${OCR_STATUS_CLASS[doc.ocrStatus]}`}>{OCR_STATUS_LABEL_DE[doc.ocrStatus]}</span>
                    <button
                      type="button"
                      disabled={ocrMutation.isPending && ocrDocumentId === doc.id}
                      className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                      onClick={() => ocrMutation.mutate(doc.id)}
                    >
                      {ocrMutation.isPending && ocrDocumentId === doc.id ? "Läuft…" : "OCR starten"}
                    </button>
                    <button type="button" className="text-xs text-ink-muted hover:text-red-500" onClick={() => removeDocumentMutation.mutate(doc.id)}>
                      Entfernen
                    </button>
                  </div>
                </div>

                {guess && (
                  <div className="space-y-1.5 rounded-md border border-accent/40 bg-surface-hover px-3 py-2 text-xs">
                    {guess.ocrStatus === "failed" && <p className="text-red-500">Texterkennung fehlgeschlagen.</p>}
                    {guess.ocrStatus === "done" && (
                      <>
                        <p className="font-medium text-ink">Vorschläge aus der Texterkennung – bitte prüfen:</p>
                        <div className="flex flex-wrap items-center gap-3">
                          <span>
                            Betrag: {guess.guessedAmountCents != null ? formatCents(guess.guessedAmountCents) : "–"}
                            {guess.guessedAmountCents != null && (
                              <button type="button" className="ml-1 text-accent hover:underline" onClick={() => applyGuessedAmount(guess)}>
                                Übernehmen
                              </button>
                            )}
                          </span>
                          <span>
                            Datum: {guess.guessedDate ?? "–"}
                            {guess.guessedDate && (
                              <button type="button" className="ml-1 text-accent hover:underline" onClick={() => applyGuessedDate(guess)}>
                                Übernehmen
                              </button>
                            )}
                          </span>
                          <span>
                            Anbieter: {guess.guessedVendor ?? "–"}
                            {guess.guessedVendor && (
                              <button type="button" className="ml-1 text-accent hover:underline" onClick={() => applyGuessedVendor(guess)}>
                                Übernehmen
                              </button>
                            )}
                          </span>
                        </div>
                        <button type="button" className="rounded-md border border-accent px-2 py-1 text-xs text-accent" onClick={() => applyAllGuessed(guess)}>
                          Alle Vorschläge übernehmen
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {documents?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Dokumente angehängt.</li>}
        </ul>
      </section>

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
          <span className={labelTextClass}>Abrechnungskreis</span>
          <select className={inputClass} value={costCircuitId} onChange={(e) => setCostCircuitId(e.target.value)}>
            {costCircuits?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.isDefault ? "Gesamtes Objekt (Standard)" : c.name}
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
