import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fakturaApi } from "../api.js";

const kindLabel: Record<string, string> = { company: "Firma", person: "Privatperson" };
const taxLabel: Record<string, string> = { standard: "Standard", reverse_charge: "Reverse-Charge" };

/** Kundenliste des Faktura-Moduls - Übersicht + Link zum Anlegen/Bearbeiten. */
function CustomersListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: customers } = useQuery({
    queryKey: ["module-faktura-customers", workspaceId],
    queryFn: () => fakturaApi.customers.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Kunden</h1>
        <Link to={`/w/${workspaceId}/modules/faktura/kunden/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neuer Kunde
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {customers?.map((customer) => (
          <li key={customer.id}>
            <Link
              to={`/w/${workspaceId}/modules/faktura/kunden/${customer.id}`}
              className="group flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <span className="font-medium">{customer.displayName}</span>
              <span className="flex items-center gap-3 text-xs text-ink-muted">
                <span>{kindLabel[customer.kind]}</span>
                <span>{taxLabel[customer.taxTreatment]}</span>
                <span>{customer.country}</span>
              </span>
            </Link>
          </li>
        ))}
        {customers?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Kunden angelegt.</li>}
      </ul>
    </div>
  );
}

export { CustomersListPage };
