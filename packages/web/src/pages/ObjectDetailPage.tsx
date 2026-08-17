import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import { objectApi, schemaApi, workspaceApi, fileApi, blockApi } from "../lib/api/resources.js";
import { getShareRole } from "../lib/api/shareMode.js";
import { ApiError } from "../lib/api/client.js";
import { ReverifyGate } from "../components/ReverifyGate.js";
import { BlockEditor } from "../components/editor/BlockEditor.js";
import { HighlightableTitle } from "../components/editor/HighlightableTitle.js";
import { HighlightedText } from "../components/editor/HighlightedText.js";
import { splitSearchTerms } from "../lib/searchHighlight.js";
import { PropertyCell } from "../components/properties/PropertyCell.js";
import { BacklinksPanel } from "../components/BacklinksPanel.js";
import { SubObjectsPanel } from "../components/SubObjectsPanel.js";
import { ScriptPanel } from "../components/ScriptPanel.js";
import { CollapsibleSection } from "../components/ui/CollapsibleSection.js";
import { BlockHistoryPanel } from "../components/BlockHistoryPanel.js";
import { CommentsPanel } from "../components/CommentsPanel.js";
import { IconPicker } from "../components/IconPicker.js";
import { CoverImage } from "../components/CoverImage.js";
import { CompanyBanner } from "../components/CompanyBanner.js";
import { ShareDialog } from "../components/ShareDialog.js";
import { ExportMenu } from "../components/ExportMenu.js";
import { ObjectSlugButton } from "../components/ObjectSlugButton.js";
import { ObjectSettingsDialog } from "../components/ObjectSettingsDialog.js";
import { PresencePanel } from "../components/PresencePanel.js";
import { IOSMenu, IOSMenuGroup, IOSMenuItem } from "../components/nav/IOSMenu.js";
import { useAuth } from "../context/AuthContext.js";
import { useConfirm } from "../context/ConfirmContext.js";
import { useMobileChrome } from "../context/MobileChromeContext.js";
import { Button } from "../components/ui/Button.js";
import { Icon } from "../components/ui/Icon.js";
import { useWorkspacePins } from "../hooks/useWorkspacePins.js";
import { useObjectHistory } from "../context/ObjectHistoryContext.js";
import { useDeleteObject } from "../hooks/useDeleteObject.js";
import { useRecentObjects } from "../hooks/useRecentObjects.js";
import { useDebouncedSave } from "../hooks/useDebouncedSave.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

// Disables interactive edit controls for a read-only (viewer/commenter) share
// - or an object the owner has locked, see `isLocked` below. See
// readOnlyContent.ts for what READ_ONLY_CONTENT_CLASS covers; this is its own
// local variant (not that shared constant) because voting buttons need a
// `data-vote-exempt` carve-out here that embedded sub-object previews (the
// shared constant's only other user, always read-only regardless of role)
// deliberately don't get - casting a vote requires only viewer access (see
// castVoteSchema), so it stays clickable even for a share visitor who can't
// edit anything else, unlike the checklist exemption below which needs
// editor access.
const READ_ONLY_LOCK =
  "locked-content [&_input:not([readonly])]:pointer-events-none [&_textarea:not([readonly])]:pointer-events-none [&_select]:pointer-events-none [&_button:not([data-view-toggle]):not([data-vote-exempt])]:pointer-events-none [&_[contenteditable=true]]:pointer-events-none [&_canvas]:pointer-events-none [&_[data-pannable]_canvas]:pointer-events-auto";

// Same as READ_ONLY_LOCK, but inputs marked `data-lock-exempt` (a checklist
// item's checkbox - see ChecklistBlock.tsx) stay interactive too. Used only
// when the object's own lock is the *sole* reason editing is disabled
// (`isLocked` below, with `canEdit` otherwise true) - checking off a to-do
// isn't "editing" the object's content the way the lock is meant to guard,
// so it's deliberately let through even then (see toggleChecklistItemSchema
// and access.ts's `allowWhenLocked`). A plain read-only share (`!canEdit`)
// still gets the strict variant above for checklist items - the underlying
// endpoint requires editor access regardless, so a share viewer's checkbox
// click would just 403 (voting buttons stay exempt either way, see above).
const READ_ONLY_LOCK_ALLOW_CHECKLIST =
  "locked-content [&_input:not([data-lock-exempt]):not([readonly])]:pointer-events-none [&_textarea:not([readonly])]:pointer-events-none [&_select]:pointer-events-none [&_button:not([data-view-toggle]):not([data-vote-exempt]):not([data-lock-exempt])]:pointer-events-none [&_[contenteditable=true]]:pointer-events-none [&_canvas]:pointer-events-none [&_[data-pannable]_canvas]:pointer-events-auto";

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
  const { t } = useTranslation();
  const params = useParams<{ workspaceId: string; objectId: string }>();
  const workspaceId = workspaceIdProp ?? params.workspaceId;
  const objectId = objectIdProp ?? params.objectId;
  const queryClient = useQueryClient();
  // Set by SearchPage.tsx when navigating in from a search result - see
  // BlockEditor.tsx's match scanning/scroll-to-match/SearchMatchToolbar.
  // Reading straight off the URL (not a prop) means this also works
  // unmodified for the tablet split-view instance of this page (it's
  // rendered on the same `/search` route, just with an `?open=` param
  // alongside this one - see SearchPage.tsx).
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightQuery = searchParams.get("highlight");
  // `@mention` notification deep-links (see NotificationBell.tsx's
  // `handleClickNotification`) - at most one of these is ever set on a given
  // navigation (mirrors the three `Notification.source` variants server-side:
  // `mention-block`/`mention-field`/`mention-comment`). A target that no
  // longer exists (block deleted, property removed from the type, comment
  // deleted) is a silent no-op wherever each is consumed below, not an error.
  const targetBlockId = searchParams.get("block");
  const targetCommentId = searchParams.get("comment");
  const targetFieldKey = searchParams.get("field");
  // Same word-splitting BlockEditor.tsx feeds into its own content matching
  // (see searchHighlight.ts) - reused here so the title and any linked-
  // object titles on this page highlight the exact same words.
  const titleTerms = highlightQuery ? splitSearchTerms(highlightQuery) : [];
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
    error: objectLoadError,
  } = useQuery({
    queryKey: ["object", objectId],
    queryFn: () => objectApi.get(objectId!),
    enabled: Boolean(objectId),
    // Never auto-retry: a share-scope rejection (401/404) won't resolve by
    // retrying, and a reverify-required 428 (see `needsReverify` below) must
    // not be masked by TanStack Query's `retry: true` meaning "retry forever"
    // rather than "retry once" - that would keep this stuck on the generic
    // "Loading" fallback instead of ever reaching the `ReverifyGate` branch.
    retry: false,
  });
  // A `requiresReverify` ("vault") object's GET comes back 428 instead of the usual 401/403/404
  // (see workspaces/access.ts's `assertReverifyAccess`) - distinguished from a real load failure
  // so this shows a reverify prompt instead of the generic "not part of what was shared" message.
  const needsReverify = objectLoadError instanceof ApiError && objectLoadError.statusCode === 428;

  const { data: properties } = useQuery({
    queryKey: ["properties", object?.objectTypeId],
    queryFn: () => schemaApi.properties(object!.objectTypeId),
    enabled: Boolean(object),
  });

  // `?field=` deep-link (see `targetFieldKey` above) - same one-shot
  // scroll+flash as BlockEditor.tsx's `?block=` handling and
  // CommentsPanel.tsx's `?comment=` handling, just targeting a property row
  // (see the `id={`property-${property.key}`}` added to each row below).
  // Silently does nothing if the property no longer exists on this object
  // type (e.g. removed since the notification was sent).
  useEffect(() => {
    if (!targetFieldKey || !properties) return;
    const el = document.getElementById(`property-${targetFieldKey}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("block-mention-flash");
    const timer = setTimeout(() => el.classList.remove("block-mention-flash"), 2000);
    return () => clearTimeout(timer);
  }, [targetFieldKey, properties]);

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
  // Desktop's reduced toolbar (lock + owner-only indicator + title + hamburger
  // only) - everything else that used to live in that row now lives in this
  // menu instead, mirroring MobileTopBar.tsx's "…" menu.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [objectId]);

  // Viewing Now, Properties, Sub-objects, Linked-from and Script are all
  // secondary/meta info rather than the object's actual content - hidden
  // behind this one toggle so they don't dominate the page, and deliberately
  // *not* persisted (localStorage etc.): always starts collapsed on a fresh
  // page load. Reset per-object too, so toggling it on one object doesn't
  // leak into the next one navigated to. Lifted into MobileChromeContext
  // (rather than local state) so MobileTopBar.tsx's "…" menu can toggle it
  // too - see that context's own comment.
  const { sectionsVisible, setSectionsVisible } = useMobileChrome();
  useEffect(() => setSectionsVisible(false), [objectId, setSectionsVisible]);

  // Every block's template-rendered text (see modules/templates/ on the
  // server) - always fetched (cheap: the server itself skips the render
  // pass entirely for an object with no template syntax at all), not gated
  // behind a separate mode. Each templatable field shows this instead of its
  // raw `{{ }}` source whenever it isn't focused - see TemplatableMarkdown.tsx.
  const { data: renderedBlocks, isLoading: renderedBlocksLoading } = useQuery({
    queryKey: ["blocksRendered", objectId],
    queryFn: () => blockApi.rendered(objectId!),
    enabled: Boolean(objectId),
  });

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
  const { visit: visitObjectHistory } = useObjectHistory();
  const { user } = useAuth();
  const confirm = useConfirm();

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const isOwner = Boolean(user && workspace && workspace.ownerId === user.id);

  useDocumentTitle(object && workspace ? `${title || t("nav.untitled")} - ${workspace.name}` : undefined);

  const dashboardMutation = useMutation({
    mutationFn: (dashboardObjectId: string | null) => workspaceApi.update(workspaceId!, { dashboardObjectId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => objectApi.setLocked(objectId!, { locked }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const requiresReverifyMutation = useMutation({
    mutationFn: (requiresReverify: boolean) => objectApi.setRequiresReverify(objectId!, { requiresReverify }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  async function handleToggleRequiresReverify(nextValue: boolean) {
    const ok = await confirm(
      nextValue
        ? {
            title: t("nav.mobile.requireReverifyConfirmTitle"),
            description: t("nav.mobile.requireReverifyConfirmDescription"),
            confirmLabel: t("nav.mobile.requireReverifyConfirmLabel"),
          }
        : {
            title: t("nav.mobile.removeReverifyConfirmTitle"),
            description: t("nav.mobile.removeReverifyConfirmDescription"),
            confirmLabel: t("nav.mobile.removeReverifyConfirmLabel"),
            danger: true,
          },
    );
    if (ok) requiresReverifyMutation.mutate(nextValue);
  }

  const commentsDisabledMutation = useMutation({
    mutationFn: (disabled: boolean) => objectApi.setCommentsDisabled(objectId!, { disabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const { deleteObject, isDeleting } = useDeleteObject(workspaceId, objectId);
  const handleDelete = () => deleteObject(object?.title ?? "");

  useEffect(() => {
    if (objectId) addRecent(objectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId]);

  // Feeds the floating mobile header's back button/breadcrumb list (see
  // ObjectHistoryContext.tsx) - a no-op outside WorkspaceLayout's tree (e.g.
  // a standalone share-link view).
  useEffect(() => {
    if (object) visitObjectHistory({ id: object.id, title: object.title, icon: object.icon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object?.id, object?.title, object?.icon]);

  if (needsReverify) {
    return <ReverifyGate onVerified={() => queryClient.invalidateQueries({ queryKey: ["object", objectId] })} />;
  }

  if (objectLoadFailed) {
    return (
      <div className="p-8 text-sm text-ink-muted">
        {t("objectDetail.notPartOfShare")}
      </div>
    );
  }

  if (!object || !properties || !workspaceId) return <div className="p-8 text-sm text-ink-muted">{t("nav.loading")}</div>;

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
  // Owner-only-edit (see the "Object Settings" dialog) overrides an editor's
  // normal role the same way the lock does, but independently of it - see
  // objects/service.ts's `assertObjectEditable` for the matching server-side
  // check. Never blocks the owner themselves.
  const isOwnerOnlyBlocked = object.ownerOnlyEdit && !isOwner;
  const effectiveCanEdit = canEdit && !isLocked && !isOwnerOnlyBlocked;

  // Rebound so their types stay non-optional inside the `renderIcon` closure
  // below - TS's narrowing from the early `if (!object || ... || !workspaceId)
  // return` above doesn't carry into a function that's *called* later rather
  // than evaluated inline.
  const obj = object;
  const wsId = workspaceId;

  // Rendered next to the title either here (no cover - see the row below,
  // default 40px) or inside CoverImage's overlay (cover set, sized to match
  // its auto-fit title text - see the `size` param) - one function so both
  // spots stay in sync instead of drifting into two slightly different
  // copies.
  function renderIcon(size?: number) {
    return effectiveCanEdit ? (
      <IconPicker
        icon={obj.icon}
        fallbackIcon={objectType?.icon ?? "file-text"}
        onChangeIcon={(newIcon) => setIconMutation.mutateAsync(newIcon).then(() => undefined)}
        onUploadIcon={async (file) => {
          const asset = await fileApi.upload(wsId, file, obj.id);
          return fileApi.downloadUrl(asset.id);
        }}
        resettable
        size={size}
      />
    ) : (
      <div className="flex shrink-0 items-center justify-center" style={{ width: size ?? 40, height: size ?? 40 }}>
        <Icon
          name={obj.icon ?? objectType?.icon ?? "file-text"}
          className={size ? undefined : "h-7 w-7"}
          style={size ? { width: size * 0.7, height: size * 0.7 } : undefined}
        />
      </div>
    );
  }

  const companyBanner = workspace && (workspace.companyName || workspace.companyCover) ? (
    <CompanyBanner
      companyName={workspace.companyName}
      companyCover={workspace.companyCover}
      companyBannerHeight={workspace.companyBannerHeight}
      companyBannerTextColor={workspace.companyBannerTextColor}
      companyBannerBackgroundColor={workspace.companyBannerBackgroundColor}
      companyBannerBold={workspace.companyBannerBold}
      companyBannerItalic={workspace.companyBannerItalic}
      companyBannerLetterSpacing={workspace.companyBannerLetterSpacing}
      companyBannerTextAlign={workspace.companyBannerTextAlign}
      companyBannerFadeEnabled={workspace.companyBannerFadeEnabled}
      companyBannerGradientEnabled={workspace.companyBannerGradientEnabled}
      companyBannerBackgroundColor2={workspace.companyBannerBackgroundColor2}
      companyBannerGradientAngle={workspace.companyBannerGradientAngle}
      companyBannerGradientStartPosition={workspace.companyBannerGradientStartPosition}
      companyBannerTextShadow={workspace.companyBannerTextShadow}
      companyBannerFontFamily={workspace.companyBannerFontFamily}
    />
  ) : null;
  // Only matters when the object has its own cover - with no cover there's
  // just the one "top" slot regardless of the setting. Anything other than
  // "above" is treated as "below" so this degrades safely if the field is
  // ever missing/unexpected.
  const companyBannerAbove = !object.cover || workspace?.companyBannerPosition === "above";

  return (
    <div>
      {/* Company banner sits above or below the object's own cover per
          workspace.companyBannerPosition when it has one, or takes the very
          top spot (where CoverImage would otherwise be first) when it
          doesn't - see CompanyBanner.tsx. */}
      {companyBannerAbove && companyBanner}
      <CoverImage
        // Forces a full remount on every object change, so its <img> starts
        // blank instead of carrying over the *previous* object's cover -
        // when navigating to an object whose data is already cached (e.g.
        // one recently viewed), this same CoverImage instance never
        // otherwise unmounts, and a plain <img> keeps showing its old
        // bitmap on screen until the new cover's fetch finishes, which
        // looks exactly like the previous page's cover briefly flashing.
        key={object.id}
        workspaceId={workspaceId}
        objectId={object.id}
        cover={object.cover}
        canEdit={effectiveCanEdit}
        title={title}
        onTitleChange={setTitle}
        coverTextStyle={object.coverTextStyle}
        coverHeight={workspace?.coverHeight}
        icon={renderIcon}
        highlightTerms={titleTerms}
      />
      {object.cover && !companyBannerAbove && companyBanner}

      {/* No top padding once there's a cover (just a small `pt-2`) - the
          sticky toolbar below is the first thing in this column then (the
          icon+title row right after it is hidden, see the `!object.cover`
          guard below), and it should sit close under the cover instead of
          leaving the same big gap a bare title would've wanted. */}
      <div
        className={`mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-6 sm:px-8 sm:pb-10 lg:flex-row ${object.cover ? "pt-2" : "pt-6 sm:pt-10"}`}
      >
        <div className="min-w-0 flex-1">
          {/* Icon + title, own row above the action-button row below -
              hidden once there's a cover (CoverImage renders both as an
              overlay on top of it instead, so showing them again here too
              would just be a redundant, differently-sized copy). Sharing a
              row with every action button (lock, pin, dashboard, share,
              delete, ...) left the title squeezed into whatever space those
              left over, cutting it off or hiding it outright for anything
              but a short title. */}
          {!object.cover && (
            <div className="flex items-center gap-2">
              {renderIcon()}
              <HighlightableTitle
                value={title}
                onChange={setTitle}
                placeholder={t("nav.untitled")}
                readOnly={!effectiveCanEdit}
                terms={titleTerms}
                className="w-full border-none bg-transparent text-3xl font-semibold outline-none"
              />
            </div>
          )}
          {/* Sticky, not just at its natural spot under the title - these
              are the controls you're most likely to reach for mid-scroll
              (unlock to fix a typo, re-share, ...), so they stay reachable
              instead of requiring a scroll back to the top every time.
              `bg-surface` matches the page's own background (see
              globals.css's `body` rule), so it blends in seamlessly rather
              than needing full-bleed negative margins to avoid a visible
              seam at this column's edges while scrolled content passes
              underneath it. z-10 is just enough to sit above the scrolled-
              under blocks below it (which don't set a z-index at all) -
              deliberately still *below* WorkspaceLayout.tsx's mobile sidebar
              (z-40), so this whole row - including ObjectSlugButton's `{}`
              button - stays hidden behind an open sidebar like the rest of
              the page's content, instead of floating over it. See
              ObjectSlugButton.tsx's own comment: an earlier version tried
              making that one button the exception (reachable even with the
              sidebar open), but a `position: sticky` ancestor like this one
              creates its own stacking context *unconditionally* (confirmed
              empirically - unlike `relative`/`absolute`, this happens even
              with no `z-*` utility at all), so the only way to actually pull
              that off was portaling the button out of this row's DOM
              subtree entirely - which visually looked like a stray, floating
              icon sitting on top of whatever the sidebar's own content
              happened to be underneath it. Not worth it for one button. */}
          {/* `top` comes from WorkspaceLayout.tsx's `--sticky-toolbar-top` -
              not a plain `top-0` - so this stops right below the mobile
              header on desktop/tablet instead of scrolling underneath it.
              Hidden entirely on phone (`hidden md:flex`) - every action here
              lives in MobileTopBar.tsx's "…" menu instead there (lock is the
              one exception, in MobileBottomBar.tsx's floating toolbar - see
              those components' own comments), so a phone user never loses
              scroll real estate to a bar that would otherwise just duplicate
              that menu. Reduced to just lock + owner-only indicator + title +
              a hamburger - everything else that used to live in this row now
              lives in that hamburger's IOSMenu below instead. */}
          <div
            className={`sticky z-10 relative hidden items-center gap-2 bg-surface py-2 md:flex ${object.cover ? "" : "mt-2"}`}
            style={{ top: "var(--sticky-toolbar-top, 0px)" }}
          >
            {/* Visible to anyone (so a non-owner understands why editing is
                blocked), but only the owner can actually toggle it - everyone
                else gets a plain, non-interactive indicator. */}
            {isOwner ? (
              <button
                onClick={() => lockMutation.mutate(!isLocked)}
                disabled={lockMutation.isPending}
                title={isLocked ? t("nav.mobile.unlockObject") : t("nav.mobile.lockObject")}
                className={`shrink-0 rounded-md p-1.5 hover:bg-surface-raised disabled:opacity-50 ${isLocked ? "text-accent" : "text-ink-muted"}`}
              >
                <Icon name={isLocked ? "lock" : "unlock"} className="h-4 w-4" />
              </button>
            ) : (
              isLocked && (
                <span className="shrink-0 p-1.5 text-accent" title={t("nav.mobile.objectLocked")}>
                  <Icon name="lock" className="h-4 w-4" />
                </span>
              )
            )}
            {/* Owner-only-edit status (see the "Object Settings" dialog in
                the hamburger menu below) - visible to everyone, including the
                owner, as confirmation it's active; never interactive here. */}
            {object.ownerOnlyEdit && (
              <span className="shrink-0 p-1.5 text-accent" title={t("objectDetail.ownerOnlyEditTooltip")}>
                <Icon name="user" className="h-4 w-4" />
              </span>
            )}
            {/* Only shown once a cover is set - that's the only case where
                the plain title input above is hidden entirely (see the
                `!object.cover` guard around it), so this is the sole visible
                copy of the title once you've scrolled the cover itself out
                of view. `min-w-0` lets it actually shrink/truncate instead
                of pushing the hamburger button off screen. */}
            {object.cover && (
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                <HighlightedText text={title || t("nav.untitled")} terms={titleTerms} />
              </span>
            )}
            {!object.cover && <span className="min-w-0 flex-1" />}
            {/* Every other action that used to sit in this row now lives
                here instead, mirroring MobileTopBar.tsx's "…" menu (see that
                component's object-actions group for the template each row
                below follows). */}
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                title={t("nav.mobile.more")}
                className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface-raised"
              >
                <Icon name="menu" className="h-4 w-4" />
              </button>
              <IOSMenu open={menuOpen} onClose={() => setMenuOpen(false)} align="end" side="bottom">
                <IOSMenuGroup>
                  {/* "Vault" protection (see modules/reverify/) - unlike the lock button above, this
                      never blocks its own toggle: the owner-only endpoint it hits deliberately skips
                      `requireAccess`'s reverify check (see objects/routes.ts), so protecting/
                      unprotecting always stays reachable regardless of the object's own current state. */}
                  {isOwner && (
                    <IOSMenuItem
                      icon="shield"
                      label={object.requiresReverify ? t("nav.mobile.disableReverify") : t("nav.mobile.requireReverify")}
                      onClick={() => {
                        setMenuOpen(false);
                        void handleToggleRequiresReverify(!object.requiresReverify);
                      }}
                    />
                  )}
                  <IOSMenuItem
                    icon="eye"
                    label={sectionsVisible ? t("objectDetail.hideSections") : t("objectDetail.showSections")}
                    onClick={() => {
                      setSectionsVisible(!sectionsVisible);
                      setMenuOpen(false);
                    }}
                  />
                </IOSMenuGroup>
                <IOSMenuGroup>
                  {/* Reachable for a read-only share visitor too, not just a
                      member - see ExportMenu.tsx's own doc comment. */}
                  <ExportMenu variant="menuItem" workspaceId={workspaceId} objectId={object.id} title={title || t("nav.untitled")} />
                  {!share && (
                    <>
                      <ObjectSlugButton key={object.id} variant="menuItem" objectId={object.id} slug={object.slug} disabled={isLocked} />
                      <IOSMenuItem
                        icon={pinned ? "pin-off" : "pin"}
                        label={pinned ? t("nav.mobile.unpinFromSidebar") : t("nav.mobile.pinToSidebar")}
                        onClick={() => {
                          togglePin(object.id);
                          setMenuOpen(false);
                        }}
                      />
                      <IOSMenuItem
                        icon="layout-dashboard"
                        label={isDashboard ? t("objectDetail.removeAsDashboard") : t("objectDetail.setAsDashboard")}
                        onClick={() => {
                          dashboardMutation.mutate(isDashboard ? null : object.id);
                          setMenuOpen(false);
                        }}
                      />
                      {/* Owner-only kill-switch for comments, deliberately
                          sitting right next to Share - the two controls
                          answer the same kind of question ("who can interact
                          with this object, and how") - see CommentsPanel.tsx's
                          own doc comment for why this is independent of the
                          lock button above. */}
                      {isOwner && (
                        <IOSMenuItem
                          icon={object.commentsDisabled ? "comment-off" : "comment"}
                          label={object.commentsDisabled ? t("objectDetail.enableComments") : t("objectDetail.disableComments")}
                          onClick={() => {
                            commentsDisabledMutation.mutate(!object.commentsDisabled);
                            setMenuOpen(false);
                          }}
                        />
                      )}
                      <ShareDialog variant="menuItem" workspaceId={workspaceId} objectId={object.id} label={t("nav.mobile.share")} />
                      {isOwner && <ObjectSettingsDialog objectId={object.id} object={object} label={t("objectDetail.objectSettings")} />}
                    </>
                  )}
                </IOSMenuGroup>
                {!share && (
                  <IOSMenuGroup>
                    <IOSMenuItem
                      icon="trash"
                      label={t("objectDetail.deleteObject")}
                      destructive
                      disabled={isDeleting || isLocked || isOwnerOnlyBlocked}
                      onClick={() => {
                        setMenuOpen(false);
                        handleDelete();
                      }}
                    />
                  </IOSMenuGroup>
                )}
              </IOSMenu>
            </div>
          </div>

          {hasRecurrence && !share && (
            <Button variant="secondary" className="mt-3" onClick={() => completeRecurringMutation.mutate()}>
              <Icon name="check-square" className="h-3.5 w-3.5" /> {t("objectDetail.markDone")}
            </Button>
          )}

          <div className={`mt-6 ${effectiveCanEdit ? "" : canEdit ? READ_ONLY_LOCK_ALLOW_CHECKLIST : READ_ONLY_LOCK}`}>
            <BlockEditor
              workspaceId={workspaceId}
              objectId={object.id}
              selectedBlockId={selectedBlockId}
              onSelectBlock={setSelectedBlockId}
              readOnly={!effectiveCanEdit}
              renderedBlocks={renderedBlocks?.rendered ?? null}
              renderedBlocksLoading={renderedBlocksLoading}
              highlightQuery={highlightQuery}
              targetBlockId={targetBlockId}
              onCloseHighlight={() =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("highlight");
                  return next;
                })
              }
            />

            {/* Hidden only for a single-object share (it can't grant access
                to browse anywhere else) - a whole-workspace share can, so
                these stay visible there, same as for a logged-in member.
                Also gated behind the master `sectionsVisible` toggle above -
                `forceExpanded` skips their own nested chevron since that
                toggle already decided whether they're shown at all. */}
            {sectionsVisible && !share?.singleObject && (
              <>
                <SubObjectsPanel
                  workspaceId={workspaceId}
                  objectId={object.id}
                  objectTypeId={object.objectTypeId}
                  subObjectIds={Array.isArray(object.values.sub_objects) ? object.values.sub_objects : []}
                  canCreate={!share && !isLocked}
                  forceExpanded
                  highlightTerms={titleTerms}
                />
                <BacklinksPanel objectId={object.id} workspaceId={workspaceId} forceExpanded highlightTerms={titleTerms} />
              </>
            )}

            {/* Members-only, full stop - never shown for any kind of share,
                not just single-object ones (see workspaces/access.ts's
                `requireRealMemberAccess` on the server side for why running
                arbitrary scripts is a stricter boundary than the rest of
                this page's editing). Also gated behind `sectionsVisible`. */}
            {sectionsVisible && !share && (
              <CollapsibleSection title={t("objectDetail.script")} forceExpanded>
                <ScriptPanel workspaceId={workspaceId} object={object} />
              </CollapsibleSection>
            )}
          </div>

          {/* Deliberately outside the READ_ONLY_LOCK-wrapped `<div>` above -
              that class disables pointer-events on every input/button inside
              it while the object is locked, which would silently swallow
              clicks on the compose box/post/delete buttons here even though
              the server-side route is explicitly lock-exempt (see
              createCommentSchema's doc comment). Also outside the
              `!share?.singleObject` gate above it - unlike backlinks/
              sub-objects (which need to browse elsewhere in the workspace),
              commenting is entirely local to this one object, so a
              single-object share can use it too.
              Not rendered at all while `commentsDisabled` - the owner's
              kill-switch button above hides the whole section, not just the
              compose box, so there's nothing left down here to show. */}
          {!object.commentsDisabled && (
            <CommentsPanel objectId={object.id} workspaceId={workspaceId} share={share} targetCommentId={targetCommentId} />
          )}
        </div>

        {/* Entirely unmounted (not just its children) while `sectionsVisible`
            is off, rather than rendering an empty `lg:w-72` column - lets the
            main content's own `flex-1` above actually reclaim that width
            instead of leaving it reserved-but-blank. */}
        {sectionsVisible && (
          <aside className="w-full shrink-0 space-y-3 border-t border-border pt-6 lg:w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            {/* Shown for anonymous share visitors too, not just real members -
                they're exactly who gets the "Anonymous <Animal>" identity and
                rename affordance this feature is for (see PresencePanel.tsx),
                same as `object.id` below is already safe to dereference
                unguarded for either audience once `object` has loaded. */}
            <PresencePanel objectId={object.id} />
            <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">{t("objectDetail.properties")}</h3>
            <div className={`space-y-3 ${effectiveCanEdit ? "" : READ_ONLY_LOCK}`}>
              {properties
                .filter((property) => property.key !== "sub_objects")
                .map((property) => (
                  <div key={property.id} id={`property-${property.key}`} data-property-key={property.key}>
                    <label className="mb-1 block text-xs text-ink-muted">{property.name}</label>
                    <PropertyCell workspaceId={workspaceId} object={object} property={property} />
                  </div>
                ))}

              {objectType?.key === "variable" && (
                <div>
                  <label className="mb-1 block text-xs text-ink-muted">{t("objectDetail.computedValue")}</label>
                  {object.values.computedValueError ? (
                    <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
                      ⚠ {String(object.values.computedValueError)}
                    </p>
                  ) : (
                    <code className="block break-all rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink">
                      {object.values.computedValue === null || object.values.computedValue === undefined
                        ? "—"
                        : String(object.values.computedValue)}
                    </code>
                  )}
                </div>
              )}
            </div>

            {selectedBlockId && <BlockHistoryPanel objectId={object.id} blockId={selectedBlockId} />}
          </aside>
        )}
      </div>
    </div>
  );
}
