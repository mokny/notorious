import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import { objectApi, schemaApi, workspaceApi, fileApi } from "../lib/api/resources.js";
import { getShareRole } from "../lib/api/shareMode.js";
import { BlockEditor } from "../components/editor/BlockEditor.js";
import { PropertyCell } from "../components/properties/PropertyCell.js";
import { BacklinksPanel } from "../components/BacklinksPanel.js";
import { SubObjectsPanel } from "../components/SubObjectsPanel.js";
import { IconPicker } from "../components/IconPicker.js";
import { CoverImage } from "../components/CoverImage.js";
import { ShareDialog } from "../components/ShareDialog.js";
import { Button } from "../components/ui/Button.js";
import { Icon } from "../components/ui/Icon.js";
import { useWorkspacePins } from "../hooks/useWorkspacePins.js";
import { useRecentObjects } from "../hooks/useRecentObjects.js";
import { useDebouncedSave } from "../hooks/useDebouncedSave.js";

// Disables interactive edit controls for a read-only (viewer/commenter) share
// without blocking `<a>`/`Link` navigation the way a blanket `pointer-events-
// none` on the whole container would - sub-object/relation links inside
// otherwise-read-only content still need to be clickable (see
// SubObjectBlock.tsx, RelationPicker.tsx).
const READ_ONLY_LOCK =
  "[&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none [&_button]:pointer-events-none [&_[contenteditable]]:pointer-events-none";

export interface SharedObjectContext {
  role: WorkspaceRole;
  /** True when the share is scoped to exactly this one object - hides navigation into sub-objects/backlinks, since such a share can't grant access to those (separate objects). */
  singleObject: boolean;
}

interface ObjectDetailPageProps {
  /** Overrides the router params - used when rendering under a public share link's own route shape (`/share/:token/...`) instead of `/w/:workspaceId/objects/:objectId`. */
  workspaceId?: string;
  objectId?: string;
  share?: SharedObjectContext;
}

export function ObjectDetailPage({ workspaceId: workspaceIdProp, objectId: objectIdProp, share: shareProp }: ObjectDetailPageProps = {}) {
  const params = useParams<{ workspaceId: string; objectId: string }>();
  const workspaceId = workspaceIdProp ?? params.workspaceId;
  const objectId = objectIdProp ?? params.objectId;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // A whole-workspace share is redirected onto this exact route with no
  // special props (see SharePage.tsx) - it's a real page in the normal
  // `/w/:workspaceId` tree, so this falls back to the active share session's
  // role instead of assuming a real logged-in member. `singleObject: false`
  // since a workspace share can browse anywhere, unlike the `share` prop
  // passed explicitly for a single-object share.
  const globalShareRole = getShareRole();
  const share: SharedObjectContext | undefined = shareProp ?? (globalShareRole ? { role: globalShareRole, singleObject: false } : undefined);
  const canEdit = !share || roleAtLeast(share.role, "editor");

  const {
    data: object,
    isError: objectLoadFailed,
  } = useQuery({
    queryKey: ["object", objectId],
    queryFn: () => objectApi.get(objectId!),
    enabled: Boolean(objectId),
    retry: !share, // a share-scope rejection (401/404) won't resolve by retrying, unlike a real transient network error
  });

  const { data: properties } = useQuery({
    queryKey: ["properties", object?.objectTypeId],
    queryFn: () => schemaApi.properties(object!.objectTypeId),
    enabled: Boolean(object),
  });

  const { data: objectTypes } = useQuery({
    queryKey: ["objectTypes", workspaceId],
    queryFn: () => schemaApi.objectTypes(workspaceId!),
    // A single-object share link can't list the workspace's object types
    // (that's workspace-wide schema browsing) - falls back to a generic icon.
    enabled: Boolean(workspaceId) && !share?.singleObject,
  });

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => objectApi.update(objectId!, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["object", objectId] });
      void queryClient.invalidateQueries({ queryKey: ["recentEdits", workspaceId] });
    },
  });
  const [title, setTitle] = useDebouncedSave(object?.title ?? "", (value) =>
    updateTitleMutation.mutateAsync(value).then(() => undefined),
  );

  const setIconMutation = useMutation({
    mutationFn: (icon: string | null) => objectApi.update(objectId!, { icon }),
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

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const dashboardMutation = useMutation({
    mutationFn: (dashboardObjectId: string | null) => workspaceApi.update(workspaceId!, { dashboardObjectId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => objectApi.remove(objectId!),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["viewResults"] });
      queryClient.removeQueries({ queryKey: ["object", objectId] });
      // If this was the workspace's dashboard object, the FK that pointed to
      // it has already been cleared server-side (ON DELETE SET NULL) - but
      // `invalidateQueries` only *schedules* a refetch; navigating before it
      // resolves would land WorkspaceHome on the still-cached (stale)
      // dashboardObjectId, bouncing it straight back to this now-deleted
      // object's URL. Awaiting it first guarantees the redirect target is
      // computed from the post-delete workspace state.
      await queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      navigate(`/w/${workspaceId}`);
    },
  });

  function handleDelete() {
    if (!object) return;
    const confirmed = window.confirm(
      `"${object.title || "Untitled"}" endgültig löschen? Dateien, die nur diesem Objekt gehören, werden mitgelöscht, und Verlinkungen von anderen Objekten hierher werden entfernt. Das kann nicht rückgängig gemacht werden.`,
    );
    if (confirmed) deleteMutation.mutate();
  }

  useEffect(() => {
    if (objectId) addRecent(objectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId]);

  if (objectLoadFailed) {
    return (
      <div className="p-8 text-sm text-ink-muted">
        This object isn't part of what was shared with you, or the link has been revoked.
      </div>
    );
  }

  if (!object || !properties || !workspaceId) return <div className="p-8 text-sm text-ink-muted">Loading…</div>;

  const hasRecurrence = properties.some((p) => p.key === "recurrence");
  const pinned = isPinned(object.id);
  const isDashboard = workspace?.dashboardObjectId === object.id;
  const objectType = objectTypes?.find((type) => type.id === object.objectTypeId);

  return (
    <div>
      {canEdit ? (
        <CoverImage workspaceId={workspaceId} objectId={object.id} cover={object.cover} />
      ) : (
        object.cover && <img src={object.cover} alt="" className="max-h-[300px] w-full object-cover" />
      )}

      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {canEdit ? (
              <IconPicker
                icon={object.icon}
                fallbackIcon={objectType?.icon ?? "file-text"}
                onChangeIcon={(newIcon) => setIconMutation.mutateAsync(newIcon).then(() => undefined)}
                onUploadIcon={async (file) => {
                  const asset = await fileApi.upload(workspaceId, file, object.id);
                  return fileApi.downloadUrl(asset.id);
                }}
                resettable
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                <Icon name={object.icon ?? objectType?.icon ?? "file-text"} className="h-7 w-7" />
              </div>
            )}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              readOnly={!canEdit}
              className="w-full border-none bg-transparent text-3xl font-semibold outline-none"
            />
            {!share && (
              <>
                <button
                  onClick={() => togglePin(object.id)}
                  title={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
                  className={`shrink-0 rounded-md p-1.5 hover:bg-surface-raised ${pinned ? "text-accent" : "text-ink-muted"}`}
                >
                  <Icon name={pinned ? "pin-off" : "pin"} className="h-4 w-4" />
                </button>
                <button
                  onClick={() => dashboardMutation.mutate(isDashboard ? null : object.id)}
                  disabled={dashboardMutation.isPending}
                  title={isDashboard ? "Remove as workspace dashboard" : "Set as workspace dashboard"}
                  className={`shrink-0 rounded-md p-1.5 hover:bg-surface-raised disabled:opacity-50 ${isDashboard ? "text-accent" : "text-ink-muted"}`}
                >
                  <Icon name="layout-dashboard" className="h-4 w-4" />
                </button>
                <ShareDialog workspaceId={workspaceId} objectId={object.id} label="Share" />
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  title="Delete object"
                  className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {hasRecurrence && !share && (
            <Button variant="secondary" className="mt-3" onClick={() => completeRecurringMutation.mutate()}>
              <Icon name="check-square" className="h-3.5 w-3.5" /> Mark done
            </Button>
          )}

          <div className={`mt-6 ${canEdit ? "" : READ_ONLY_LOCK}`}>
            <BlockEditor workspaceId={workspaceId} objectId={object.id} />
          </div>

          {/* Hidden only for a single-object share (it can't grant access to
              browse anywhere else) - a whole-workspace share can, so these
              stay visible there, same as for a logged-in member. */}
          {!share?.singleObject && (
            <>
              <SubObjectsPanel
                workspaceId={workspaceId}
                objectId={object.id}
                objectTypeId={object.objectTypeId}
                subObjectIds={Array.isArray(object.values.sub_objects) ? object.values.sub_objects : []}
                canCreate={!share}
              />
              <BacklinksPanel objectId={object.id} workspaceId={workspaceId} />
            </>
          )}
        </div>

        <aside className="w-full shrink-0 space-y-3 border-t border-border pt-6 lg:w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Properties</h3>
          <div className={`space-y-3 ${canEdit ? "" : READ_ONLY_LOCK}`}>
            {properties
              .filter((property) => property.key !== "sub_objects")
              .map((property) => (
                <div key={property.id}>
                  <label className="mb-1 block text-xs text-ink-muted">{property.name}</label>
                  <PropertyCell workspaceId={workspaceId} object={object} property={property} />
                </div>
              ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
