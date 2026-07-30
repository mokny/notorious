import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { schemaApi, objectApi } from "../lib/api/resources.js";
import { Icon } from "../components/ui/Icon.js";

/** Simple type-switcher + plain object list for a whole-workspace share - intentionally not the full Views/Search experience, just enough to browse. */
export function SharedWorkspaceBrowse({ workspaceId }: { workspaceId: string }) {
  const [activeTypeId, setActiveTypeId] = useState<string | null>(null);

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId),
  });

  const effectiveTypeId = activeTypeId ?? objectTypes?.[0]?.id ?? null;

  const { data: objects } = useQuery({
    queryKey: ["sharedObjects", workspaceId, effectiveTypeId],
    queryFn: () => objectApi.list(workspaceId, { objectTypeId: effectiveTypeId ?? undefined }),
    enabled: Boolean(effectiveTypeId),
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {objectTypes?.map((type) => (
          <button
            key={type.id}
            onClick={() => setActiveTypeId(type.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
              type.id === effectiveTypeId
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-ink-muted hover:bg-surface-raised"
            }`}
          >
            <Icon name={type.icon} className="h-3.5 w-3.5" /> {type.name}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {objects?.items.map((object) => (
          <Link
            key={object.id}
            to={`objects/${object.id}`}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-raised"
          >
            <Icon name={object.icon ?? "file-text"} className="h-4 w-4 text-ink-muted" />
            {object.title || "Untitled"}
          </Link>
        ))}
        {objects?.items.length === 0 && <p className="px-3 text-sm text-ink-muted">Nothing here yet.</p>}
      </div>
    </div>
  );
}
