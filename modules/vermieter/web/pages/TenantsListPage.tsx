import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { vermieterApi } from "../api.js";

/** Liste aller Mieter dieses Workspaces. */
function TenantsListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: tenants } = useQuery({
    queryKey: ["module-vermieter-tenants", workspaceId],
    queryFn: () => vermieterApi.tenants.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Mieter</h1>
        <Link to={`/w/${workspaceId}/modules/vermieter/mieter/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neuer Mieter
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {tenants?.map((tenant) => (
          <li key={tenant.id}>
            <Link
              to={`/w/${workspaceId}/modules/vermieter/mieter/${tenant.id}`}
              className="group flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <span className="font-medium">{tenant.name}</span>
              <span className="text-xs text-ink-muted">
                {tenant.email} {tenant.phone && `· ${tenant.phone}`}
              </span>
            </Link>
          </li>
        ))}
        {tenants?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Mieter angelegt.</li>}
      </ul>
    </div>
  );
}

export { TenantsListPage };
