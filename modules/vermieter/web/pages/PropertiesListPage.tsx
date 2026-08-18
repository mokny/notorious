import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { vermieterApi } from "../api.js";
import { RemindersBanner } from "../components/RemindersBanner.js";

/** Liste aller Immobilien dieses Workspaces. */
function PropertiesListPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: properties } = useQuery({
    queryKey: ["module-vermieter-properties", workspaceId],
    queryFn: () => vermieterApi.properties.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      {workspaceId && <RemindersBanner workspaceId={workspaceId} />}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Immobilien</h1>
        <Link to={`/w/${workspaceId}/modules/vermieter/immobilien/neu`} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
          Neue Immobilie
        </Link>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border">
        {properties?.map((property) => (
          <li key={property.id}>
            <Link
              to={`/w/${workspaceId}/modules/vermieter/immobilien/${property.id}`}
              className="group flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-surface-hover"
            >
              <span className="font-medium">{property.name}</span>
              <span className="text-xs text-ink-muted">
                {property.street} {property.houseNumber}, {property.postalCode} {property.city}
              </span>
            </Link>
          </li>
        ))}
        {properties?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Noch keine Immobilien angelegt.</li>}
      </ul>
    </div>
  );
}

export { PropertiesListPage };
