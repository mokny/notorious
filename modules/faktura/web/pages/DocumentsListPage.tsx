import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { fakturaApi, type DocumentType } from "../api.js";

const TABS: Array<{ type: DocumentType | undefined; label: string }> = [
  { type: undefined, label: "Alle" },
  { type: "quote", label: "Angebote" },
  { type: "order", label: "Aufträge" },
  { type: "invoice", label: "Rechnungen" },
  { type: "credit_note", label: "Gutschriften" },
];

const statusLabel: Record<string, string> = { draft: "Entwurf", issued: "Ausgestellt", cancelled: "Storniert" };
const statusClass: Record<string, string> = {
  draft: "text-ink-muted",
  issued: "text-emerald-600",
  cancelled: "text-red-500",
};

/** Belegübersicht (Angebote/Aufträge/Rechnungen/Gutschriften) mit Typ-Filter-Tabs. */
function DocumentsListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [searchParams] = useSearchParams();
  const activeType = (searchParams.get("type") as DocumentType | null) ?? undefined;

  const { data: documents } = useQuery({
    queryKey: ["module-faktura-documents", workspaceId, activeType],
    queryFn: () => fakturaApi.documents.list(workspaceId!, activeType),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Belege</h1>
        <Link to={`/w/${workspaceId}/modules/faktura/belege/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neuer Beleg
        </Link>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.label}
            to={`/w/${workspaceId}/modules/faktura/belege${tab.type ? `?type=${tab.type}` : ""}`}
            className={`px-3 py-1.5 text-sm ${activeType === tab.type ? "border-b-2 border-accent font-medium text-ink" : "text-ink-muted"}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {documents?.map((doc) => (
          <li key={doc.id}>
            <Link
              to={`/w/${workspaceId}/modules/faktura/belege/${doc.id}`}
              className="group flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <span className="font-medium">{doc.number ?? "(Entwurf)"}</span>
              <span className="flex items-center gap-3 text-xs">
                <span className={statusClass[doc.status]}>{statusLabel[doc.status]}</span>
                <span className="text-ink-muted">{doc.dueDate ?? doc.issueDate ?? ""}</span>
                <span className="font-medium text-ink">{formatCents(doc.totalCents)}</span>
              </span>
            </Link>
          </li>
        ))}
        {documents?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Belege vorhanden.</li>}
      </ul>
    </div>
  );
}

export { DocumentsListPage };
