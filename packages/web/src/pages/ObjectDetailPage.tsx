import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import { objectApi, schemaApi, workspaceApi, fileApi } from "../lib/api/resources.js";
import { getShareRole, withShareToken } from "../lib/api/shareMode.js";
import { READ_ONLY_CONTENT_CLASS } from "../lib/readOnlyContent.js";
import { BlockEditor } from "../components/editor/BlockEditor.js";
import { PropertyCell } from "../components/properties/PropertyCell.js";
import { BacklinksPanel } from "../components/BacklinksPanel.js";
import { SubObjectsPanel } from "../components/SubObjectsPanel.js";
import { ScriptPanel } from "../components/ScriptPanel.js";
import { CollapsibleSection } from "../components/ui/CollapsibleSection.js";
import { BlockHistoryPanel } from "../components/BlockHistoryPanel.js";
import { IconPicker } from "../components/IconPicker.js";
import { CoverImage } from "../components/CoverImage.js";
import { ShareDialog } from "../components/ShareDialog.js";
import { useConfirm } from "../context/ConfirmContext.js";
import { useAuth } from "../context/AuthContext.js";
import { Button } from "../components/ui/Button.js";
import { Icon } from "../components/ui/Icon.js";
import { useWorkspacePins } from "../hooks/useWorkspacePins.js";
import { useRecentObjects } from "../hooks/useRecentObjects.js";
import { useDebouncedSave } from "../hooks/useDebouncedSave.js";

// Disables interactive edit controls for a read-only (viewer/commenter) share
// - or an object the owner has locked, see `isLocked` below. See
// readOnlyContent.ts for what this covers and why.
const READ_ONLY_LOCK = READ_ONLY_CONTENT_CLASS;

// Same as READ_ONLY_LOCK, but inputs marked `data-lock-exempt` (a checklist
// item's checkbox - see ChecklistBlock.tsx) stay interactive. Used only when
// the object's own lock is the *sole* reason editing is disabled (`isLocked`
// below, with `canEdit` otherwise true) - checking off a to-do isn't
// "editing" the object's content the way the lock is meant to guard, so it's
// deliberately let through even then (see toggleChecklistItemSchema and
// access.ts's `allowWhenLocked`). A plain read-only share (`!canEdit`) still
// gets the strict variant above - the underlying endpoint requires editor
// access regardless, so a share viewer's checkbox click would just 403.
const READ_ONLY_LOCK_ALLOW_CHECKLIST =
  "locked-content [&_input:not([data-lock-exempt])]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none [&_button:not([data-view-toggle])]:pointer-events-none [&_[contenteditable]]:pointer-events-none [&_canvas]:pointer-events-none";

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
  const confirm = useConfirm();
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
  // Which block's edit history the Properties sidebar shows (see
  // BlockHistoryPanel.tsx) - reset to null on navigating to a different
  // object, so a stale selection from the last object never lingers.
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  useEffect(() => setSelectedBlockId(null), [objectId]);

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
  const { user } = useAuth();

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const isOwner = Boolean(user && workspace && workspace.ownerId === user.id);

  const dashboardMutation = useMutation({
    mutationFn: (dashboardObjectId: string | null) => workspaceApi.update(workspaceId!, { dashboardObjectId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => objectApi.setLocked(objectId!, { locked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
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

  async function handleDelete() {
    if (!object) return;
    const confirmed = await confirm({
      title: `"${object.title || "Untitled"}" endgültig löschen?`,
      description:
        "Dateien, die nur diesem Objekt gehören, werden mitgelöscht, und Verlinkungen von anderen Objekten hierher werden entfernt. Das kann nicht rückgängig gemacht werden.",
      confirmLabel: "Delete",
      danger: true,
    });
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
  // Locking (owner-only, see the lock button below) blocks edits for
  // *everyone*, including the owner who locked it - unlike `canEdit` above
  // (share role), which only ever restricts an anonymous visitor. Combined
  // here rather than folded into `canEdit` itself, since a few things below
  // (the lock button itself, obviously) need to stay clickable regardless
  // of the object's current lock state.
  const isLocked = Boolean(object.lockedAt);
  const effectiveCanEdit = canEdit && !isLocked;

  return (
    <div>
      {effectiveCanEdit ? (
        <CoverImage workspaceId={workspaceId} objectId={object.id} cover={object.cover} />
      ) : (
        object.cover && <img src={withShareToken(object.cover)} alt="" className="max-h-[300px] w-full object-cover" />
      )}

      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {effectiveCanEdit ? (
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
              readOnly={!effectiveCanEdit}
              className="w-full border-none bg-transparent text-3xl font-semibold outline-none"
            />
            {/* Visible to anyone (so a non-owner understands why editing is
                blocked), but only the owner can actually toggle it - everyone
                else gets a plain, non-interactive indicator. */}
            {isOwner ? (
              <button
                onClick={() => lockMutation.mutate(!isLocked)}
                disabled={lockMutation.isPending}
                title={isLocked ? "Unlock this object" : "Lock this object against edits"}
                className={`shrink-0 rounded-md p-1.5 hover:bg-surface-raised disabled:opacity-50 ${isLocked ? "text-accent" : "text-ink-muted"}`}
              >
                <Icon name={isLocked ? "lock" : "unlock"} className="h-4 w-4" />
              </button>
            ) : (
              isLocked && (
                <span className="shrink-0 p-1.5 text-accent" title="This object is locked against edits">
                  <Icon name="lock" className="h-4 w-4" />
                </span>
              )
            )}
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
                  disabled={deleteMutation.isPending || isLocked}
                  title={isLocked ? "Unlock this object before deleting it" : "Delete object"}
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

          <div className={`mt-6 ${effectiveCanEdit ? "" : canEdit ? READ_ONLY_LOCK_ALLOW_CHECKLIST : READ_ONLY_LOCK}`}>
            <BlockEditor
              workspaceId={workspaceId}
              objectId={object.id}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
            />

            {/* Hidden only for a single-object share (it can't grant access
                to browse anywhere else) - a whole-workspace share can, so
                these stay visible there, same as for a logged-in member. */}
            {!share?.singleObject && (
              <>
                <SubObjectsPanel
                  workspaceId={workspaceId}
                  objectId={object.id}
                  objectTypeId={object.objectTypeId}
                  subObjectIds={Array.isArray(object.values.sub_objects) ? object.values.sub_objects : []}
                  canCreate={!share && !isLocked}
                />
                <BacklinksPanel objectId={object.id} workspaceId={workspaceId} />
              </>
            )}

            {/* Members-only, full stop - never shown for any kind of share,
                not just single-object ones (see workspaces/access.ts's
                `requireRealMemberAccess` on the server side for why running
                arbitrary scripts is a stricter boundary than the rest of
                this page's editing). */}
            {!share && (
              <CollapsibleSection title="Script">
                <ScriptPanel workspaceId={workspaceId} object={object} />
              </CollapsibleSection>
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-3 border-t border-border pt-6 lg:w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Properties</h3>
          <div className={`space-y-3 ${effectiveCanEdit ? "" : READ_ONLY_LOCK}`}>
            {properties
              .filter((property) => property.key !== "sub_objects")
              .map((property) => (
                <div key={property.id}>
                  <label className="mb-1 block text-xs text-ink-muted">{property.name}</label>
                  <PropertyCell workspaceId={workspaceId} object={object} property={property} />
                </div>
              ))}
          </div>

          {selectedBlockId && <BlockHistoryPanel objectId={object.id} blockId={selectedBlockId} />}
        </aside>
      </div>
    </div>
  );
}
