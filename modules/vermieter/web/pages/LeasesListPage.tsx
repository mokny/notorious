import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@notorious/shared";
import { vermieterApi, type VermieterLeaseStatus } from "../api.js";

function formatUnitWithTenants(
  unitLabel: string,
  tenantIds: string[],
  tenantsById: Map<string, string>,
  status: VermieterLeaseStatus,
): string {
  const names = tenantIds.map((id) => tenantsById.get(id) ?? "Unbekannt");
  const namesPart = names.length > 0 ? names.join(", ") : "kein Mieter zugeordnet";
  const statusPart = status === "active" ? "wohnt noch dort" : "Mietverhältnis beendet";
  return `${unitLabel} (${namesPart} – ${statusPart})`;
}

const inputClass = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

/** Liste aller Mietverträge, filterbar nach Immobilie/Einheit und Status. */
function LeasesListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [propertyId, setPropertyId] = useState("");
  const [statusFilter, setStatusFilter] = useState<VermieterLeaseStatus | "">("");

  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: units } = useQuery({
    queryKey: ["module-vermieter-units-all", workspaceId],
    queryFn: () => vermieterApi.units.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: leases } = useQuery({
    queryKey: ["module-vermieter-leases", workspaceId],
    queryFn: () => vermieterApi.leases.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const { data: tenants } = useQuery({
    queryKey: ["module-vermieter-tenants", workspaceId],
    queryFn: () => vermieterApi.tenants.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const tenantsById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name] as const));

  const filtered = (leases ?? []).filter((lease) => {
    if (statusFilter && lease.status !== statusFilter) return false;
    if (propertyId) {
      const unit = units?.find((u) => u.id === lease.unitId);
      if (unit?.propertyId !== propertyId) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mietverträge</h1>
        <Link to={`/w/${workspaceId}/modules/vermieter/mietvertraege/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neuer Mietvertrag
        </Link>
      </div>

      <div className="flex gap-3">
        <select className={inputClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
          <option value="">Alle Immobilien</option>
          {properties?.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
        <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as VermieterLeaseStatus | "")}>
          <option value="">Alle Status</option>
          <option value="active">Aktiv</option>
          <option value="ended">Beendet</option>
        </select>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {filtered.map((lease) => {
          const unit = units?.find((u) => u.id === lease.unitId);
          return (
            <li key={lease.id}>
              <Link
                to={`/w/${workspaceId}/modules/vermieter/mietvertraege/${lease.id}`}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
              >
                <span className="font-medium">
                  {formatUnitWithTenants(unit?.label ?? lease.unitId, lease.tenantIds, tenantsById, lease.status)}
                </span>
                <span className="flex items-center gap-3 text-xs text-ink-muted">
                  <span>{formatCents(lease.coldRentCents + lease.nkPrepaymentCents)}/Monat</span>
                  <span>{lease.status === "active" ? "Aktiv" : "Beendet"}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Keine Mietverträge gefunden.</li>}
      </ul>
    </div>
  );
}

export { LeasesListPage };
