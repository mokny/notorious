import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { objectApi } from "../lib/api/resources.js";
import { Icon } from "./ui/Icon.js";

export function BacklinksPanel({ objectId, workspaceId }: { objectId: string; workspaceId: string }) {
  const { data: backlinks } = useQuery({ queryKey: ["backlinks", objectId], queryFn: () => objectApi.backlinks(objectId) });

  if (!backlinks || backlinks.length === 0) return null;

  return (
    <div className="mt-10 border-t border-border pt-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Linked from {backlinks.length} object(s)</h3>
      <div className="space-y-1">
        {backlinks.map((object) => (
          <Link
            key={object.id}
            to={`/w/${workspaceId}/objects/${object.id}`}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-surface-raised"
          >
            <Icon name={object.icon ?? "file-text"} className="h-3.5 w-3.5 text-ink-muted" />
            {object.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
