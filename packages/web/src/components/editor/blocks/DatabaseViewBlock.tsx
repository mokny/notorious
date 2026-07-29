import { useQuery } from "@tanstack/react-query";
import type { DatabaseViewContent } from "@notorious/shared";
import { viewApi } from "../../../lib/api/resources.js";
import { ViewRenderer } from "../../views/ViewRenderer.js";

interface DatabaseViewBlockProps {
  content: DatabaseViewContent;
  workspaceId: string;
  onSave: (content: DatabaseViewContent) => void;
}

/** Embeds a saved view inline in a note - Notion calls this a "linked database". */
export function DatabaseViewBlock({ content, workspaceId, onSave }: DatabaseViewBlockProps) {
  const { data: views } = useQuery({ queryKey: ["allViews", workspaceId], queryFn: () => viewApi.list(workspaceId) });
  const view = views?.find((v) => v.id === content.viewId);

  if (!view) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-2 text-sm text-ink-muted">Choose a view to embed:</p>
        <select
          onChange={(e) => onSave({ ...content, viewId: e.target.value })}
          defaultValue=""
          className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm"
        >
          <option value="" disabled>
            Select a view…
          </option>
          {views?.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.type})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-muted">{view.name}</div>
      <div className="max-h-96 overflow-y-auto">
        <ViewRenderer workspaceId={workspaceId} view={view} />
      </div>
    </div>
  );
}
