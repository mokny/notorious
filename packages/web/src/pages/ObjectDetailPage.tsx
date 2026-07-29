import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { objectApi, schemaApi } from "../lib/api/resources.js";
import { BlockEditor } from "../components/editor/BlockEditor.js";
import { PropertyCell } from "../components/properties/PropertyCell.js";
import { BacklinksPanel } from "../components/BacklinksPanel.js";
import { Button } from "../components/ui/Button.js";
import { Icon } from "../components/ui/Icon.js";
import { useWorkspacePins } from "../hooks/useWorkspacePins.js";
import { useRecentObjects } from "../hooks/useRecentObjects.js";

export function ObjectDetailPage() {
  const { workspaceId, objectId } = useParams<{ workspaceId: string; objectId: string }>();
  const queryClient = useQueryClient();

  const { data: object } = useQuery({
    queryKey: ["object", objectId],
    queryFn: () => objectApi.get(objectId!),
    enabled: Boolean(objectId),
  });

  const { data: properties } = useQuery({
    queryKey: ["properties", object?.objectTypeId],
    queryFn: () => schemaApi.properties(object!.objectTypeId),
    enabled: Boolean(object),
  });

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => objectApi.update(objectId!, { title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const completeRecurringMutation = useMutation({
    mutationFn: () => objectApi.completeRecurring(objectId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["object", objectId] });
      void queryClient.invalidateQueries({ queryKey: ["viewResults"] });
    },
  });

  const { isPinned, toggle: togglePin } = useWorkspacePins(workspaceId);
  const { addRecent } = useRecentObjects(workspaceId);

  useEffect(() => {
    if (objectId) addRecent(objectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId]);

  if (!object || !properties || !workspaceId) return <div className="p-8 text-sm text-ink-muted">Loading…</div>;

  const hasRecurrence = properties.some((p) => p.key === "recurrence");
  const pinned = isPinned(object.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <input
            value={object.title}
            onChange={(e) => updateTitleMutation.mutate(e.target.value)}
            placeholder="Untitled"
            className="w-full border-none bg-transparent text-3xl font-semibold outline-none"
          />
          <button
            onClick={() => togglePin(object.id)}
            title={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
            className={`shrink-0 rounded-md p-1.5 hover:bg-surface-raised ${pinned ? "text-accent" : "text-ink-muted"}`}
          >
            <Icon name={pinned ? "pin-off" : "pin"} className="h-4 w-4" />
          </button>
        </div>

        {hasRecurrence && (
          <Button variant="secondary" className="mt-3" onClick={() => completeRecurringMutation.mutate()}>
            <Icon name="check-square" className="h-3.5 w-3.5" /> Mark done
          </Button>
        )}

        <div className="mt-6">
          <BlockEditor workspaceId={workspaceId} objectId={object.id} />
        </div>

        <BacklinksPanel objectId={object.id} workspaceId={workspaceId} />
      </div>

      <aside className="w-full shrink-0 space-y-3 border-t border-border pt-6 lg:w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Properties</h3>
        {properties.map((property) => (
          <div key={property.id}>
            <label className="mb-1 block text-xs text-ink-muted">{property.name}</label>
            <PropertyCell workspaceId={workspaceId} object={object} property={property} />
          </div>
        ))}
      </aside>
    </div>
  );
}
