import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi, type DocumentType, type DocumentInput } from "../api.js";
import { DocumentLineEditor, emptyLine, lineFormToInput, type LineForm } from "../components/DocumentLineEditor.js";
import { TaxBreakdownTable } from "../components/TaxBreakdownTable.js";
import { AttachmentsPanel } from "../components/AttachmentsPanel.js";

const typeLabel: Record<DocumentType, string> = { quote: "Angebot", order: "Auftrag", invoice: "Rechnung", credit_note: "Gutschrift" };
const nextType: Partial<Record<DocumentType, DocumentType>> = { quote: "order", order: "invoice", invoice: "credit_note" };
const convertActionLabel: Record<DocumentType, string> = { quote: "In Auftrag umwandeln", order: "Rechnung erzeugen", invoice: "Gutschrift erzeugen", credit_note: "" };
const statusLabel: Record<string, string> = { draft: "Entwurf", issued: "Ausgestellt", cancelled: "Storniert" };
const inputClass = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const labelClass = "block space-y-1 text-sm";
const labelTextClass = "text-xs font-medium text-ink-muted";

/** Anlegen/Bearbeiten eines Belegs (Angebot/Auftrag/Rechnung/Gutschrift). `:id === "neu"` -> Anlage-Modus mit Typwahl. Ausgestellte Belege sind schreibgeschützt (GoBD-Unveränderlichkeit, siehe services/documents.ts). */
function DocumentDetailPage() {
  const { workspaceId, id } = useParams<{ workspaceId: string; id: string }>();
  const isNew = id === "neu";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: document } = useQuery({
    queryKey: ["module-faktura-document", workspaceId, id],
    queryFn: () => fakturaApi.documents.get(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });
  const { data: customers } = useQuery({
    queryKey: ["module-faktura-customers", workspaceId],
    queryFn: () => fakturaApi.customers.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: products } = useQuery({
    queryKey: ["module-faktura-products", workspaceId],
    queryFn: () => fakturaApi.products.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const [type, setType] = useState<DocumentType>("invoice");
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);

  useEffect(() => {
    if (document) {
      setType(document.type);
      setCustomerId(document.customerId);
      setDueDate(document.dueDate?.slice(0, 10) ?? "");
      setNotes(document.notes);
      setLines(
        document.lines.map((l) => ({
          productId: l.productId ?? "",
          description: l.description,
          quantity: String(l.quantity),
          unit: l.unit,
          unitPrice: (l.unitPriceCents / 100).toFixed(2).replace(".", ","),
          discountPercent: String(l.discountPercent),
          taxRateBasisPoints: l.taxRateBasisPoints,
        })),
      );
    }
  }, [document]);

  const isReadOnly = Boolean(document && document.status !== "draft");

  const issueMutation = useMutation({
    mutationFn: () => fakturaApi.documents.issue(workspaceId!, id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-document", workspaceId, id] });
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-documents", workspaceId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => fakturaApi.documents.cancel(workspaceId!, id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-document", workspaceId, id] });
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-documents", workspaceId] });
    },
  });

  const convertMutation = useMutation({
    mutationFn: () => fakturaApi.documents.convert(workspaceId!, id!, nextType[document!.type]!),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-documents", workspaceId] });
      navigate(`/w/${workspaceId}/modules/faktura/belege/${created.id}`);
    },
  });

  const [emailRecipient, setEmailRecipient] = useState("");
  const sendEmailMutation = useMutation({
    mutationFn: () => fakturaApi.documents.sendEmail(workspaceId!, id!, emailRecipient.trim() || undefined),
  });

  const { data: derived } = useQuery({
    queryKey: ["module-faktura-document-derived", workspaceId, id],
    queryFn: () => fakturaApi.documents.derived(workspaceId!, id!),
    enabled: Boolean(workspaceId) && !isNew,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const input: DocumentInput = {
        type,
        customerId,
        dueDate: dueDate || null,
        notes,
        lines: lines.filter((l) => l.description.trim()).map(lineFormToInput),
      };
      return isNew ? fakturaApi.documents.create(workspaceId!, input) : fakturaApi.documents.update(workspaceId!, id!, input);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["module-faktura-documents", workspaceId] });
      navigate(`/w/${workspaceId}/modules/faktura/belege/${saved.id}`);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (customerId && lines.some((l) => l.description.trim())) saveMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {isNew ? "Neuer Beleg" : `${typeLabel[type]} ${document?.number ?? "(Entwurf)"}`}
        </h1>
        <div className="flex items-center gap-3">
          {document && (
            <a
              href={`/api/v1/workspaces/${workspaceId}/modules/faktura/documents/${document.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-sm"
            >
              PDF
            </a>
          )}
          {document && <span className="text-sm text-ink-muted">{statusLabel[document.status]}</span>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Typ</span>
            <select className={inputClass} value={type} disabled={!isNew} onChange={(e) => setType(e.target.value as DocumentType)}>
              <option value="quote">Angebot</option>
              <option value="order">Auftrag</option>
              <option value="invoice">Rechnung</option>
              <option value="credit_note">Gutschrift</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Kunde *</span>
            <select className={inputClass} value={customerId} disabled={isReadOnly} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">–</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Fällig am</span>
            <input type="date" className={inputClass} disabled={isReadOnly} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">Positionen</h2>
          <DocumentLineEditor lines={lines} onChange={setLines} products={products} readOnly={isReadOnly} />
        </section>

        <label className={labelClass}>
          <span className={labelTextClass}>Notizen</span>
          <textarea className={inputClass} rows={2} disabled={isReadOnly} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {document && (
          <section className="space-y-2 rounded-md border border-border p-3">
            <TaxBreakdownTable breakdown={document.taxBreakdown} />
            <div className="flex justify-end gap-6 pt-2 text-sm">
              <span className="text-ink-muted">Zwischensumme: {formatCents(document.subtotalCents)}</span>
              <span className="text-ink-muted">USt.: {formatCents(document.taxTotalCents)}</span>
              <span className="font-semibold">Gesamt: {formatCents(document.totalCents)}</span>
            </div>
            {document.legalDisclaimerText && <p className="text-xs text-ink-muted">{document.legalDisclaimerText}</p>}
          </section>
        )}

        {!isReadOnly && (
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saveMutation.isPending} className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50">
              Entwurf speichern
            </button>
            {!isNew && (
              <button
                type="button"
                disabled={issueMutation.isPending}
                onClick={() => issueMutation.mutate()}
                className="rounded-md border border-accent px-4 py-1.5 text-sm text-accent disabled:opacity-50"
              >
                Ausstellen
              </button>
            )}
            {saveMutation.isError && <span className="text-xs text-red-500">Fehler beim Speichern.</span>}
            {issueMutation.isError && <span className="text-xs text-red-500">Fehler beim Ausstellen.</span>}
          </div>
        )}

        {document && document.status === "issued" && (
          <section className="flex items-center gap-2 rounded-md border border-border p-3">
            <input
              type="email"
              placeholder="Empfänger (leer = Kundenkontakt)"
              className={inputClass}
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value)}
            />
            <button
              type="button"
              disabled={sendEmailMutation.isPending}
              onClick={() => sendEmailMutation.mutate()}
              className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Per E-Mail senden
            </button>
            {sendEmailMutation.isSuccess && <span className="text-xs text-emerald-600">Gesendet an {sendEmailMutation.data.sentTo}.</span>}
            {sendEmailMutation.isError && (
              <span className="text-xs text-red-500">{sendEmailMutation.error instanceof Error ? sendEmailMutation.error.message : "Fehler."}</span>
            )}
          </section>
        )}

        {document && document.status === "issued" && (
          <div className="flex items-center gap-3">
            {nextType[document.type] && (
              <button
                type="button"
                disabled={convertMutation.isPending}
                onClick={() => convertMutation.mutate()}
                className="rounded-md bg-accent px-4 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {convertActionLabel[document.type]}
              </button>
            )}
            <button
              type="button"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
              className="rounded-md border border-red-500 px-4 py-1.5 text-sm text-red-500 disabled:opacity-50"
            >
              Stornieren
            </button>
            {cancelMutation.isError && <span className="text-xs text-red-500">Fehler beim Stornieren.</span>}
            {convertMutation.isError && <span className="text-xs text-red-500">Fehler beim Erzeugen.</span>}
          </div>
        )}

        {document?.sourceDocumentId && (
          <p className="text-xs text-ink-muted">
            Erzeugt aus{" "}
            <Link className="underline" to={`/w/${workspaceId}/modules/faktura/belege/${document.sourceDocumentId}`}>
              {document.sourceDocumentId}
            </Link>
            .
          </p>
        )}

        {derived && derived.length > 0 && (
          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-ink">Daraus erzeugt</h2>
            <ul className="space-y-1 text-xs">
              {derived.map((d) => (
                <li key={d.id}>
                  <Link className="underline" to={`/w/${workspaceId}/modules/faktura/belege/${d.id}`}>
                    {typeLabel[d.type]} {d.number ?? "(Entwurf)"} - {formatCents(d.totalCents)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>

      {!isNew && type === "order" && <AttachmentsPanel workspaceId={workspaceId!} entityType="order" entityId={id!} />}
    </div>
  );
}

export { DocumentDetailPage };
