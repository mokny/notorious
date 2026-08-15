import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ObjectRecord } from "@notorious/shared";
import { useWorkspaceRole } from "../../hooks/useWorkspaceRole.js";
import { useObjectRowActions } from "../../hooks/useObjectRowActions.js";
import type { ObjectRowContextMenuPosition } from "../../hooks/useObjectRowContextMenu.js";
import { buildSidebarObjectContextMenuItems } from "../../lib/objectContextMenu.js";
import { ContextMenu } from "../ui/ContextMenu.js";
import { ShareDialog } from "../ShareDialog.js";
import { Icon } from "../ui/Icon.js";

interface ObjectRowContextMenuButtonProps {
  workspaceId: string;
  objectId: string;
  /** Passed in rather than fetched here - PinnedNavItem already has this for sub-objects; RecentNavItem/RecentlyEditedNavItem fetch it just for this. */
  object: ObjectRecord | undefined;
  pinned: boolean;
  onTogglePin: () => void;
  /** Lifted into the caller (see useObjectRowContextMenu.ts) so the row's own onContextMenu handler and this button share one open/close state - the caller's outer row `<div>` gets `onContextMenu={menu.openFromMouseEvent}`, this button gets `onClick={menu.openFromButton}`. */
  position: ObjectRowContextMenuPosition | null;
  onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onClose: () => void;
  hasHover: boolean;
  touched: boolean;
}

/** The hover-revealed "..." trigger + the menu itself (portal) + the controlled ShareDialog instance a "Share..." row opens - shared by every sidebar object row (Pinned/Recent/Recently edited). */
export function ObjectRowContextMenuButton({
  workspaceId,
  objectId,
  object,
  pinned,
  onTogglePin,
  position,
  onOpen,
  onClose,
  hasHover,
  touched,
}: ObjectRowContextMenuButtonProps) {
  const { t } = useTranslation();
  const [shareOpen, setShareOpen] = useState(false);
  const { canEdit, isOwner } = useWorkspaceRole(workspaceId);
  const actions = useObjectRowActions(workspaceId, objectId);

  const items = buildSidebarObjectContextMenuItems(
    t,
    {
      workspaceId,
      objectId,
      pinned,
      locked: Boolean(object?.lockedAt),
      archived: Boolean(object?.archivedAt),
      canEdit,
      isOwner,
    },
    {
      togglePin: onTogglePin,
      setLocked: actions.setLocked,
      archive: actions.archive,
      restore: actions.restore,
      openShare: () => setShareOpen(true),
      deleteObject: () => actions.deleteObject(object?.title ?? ""),
    },
  );

  return (
    <>
      <button
        onClick={onOpen}
        className={`shrink-0 rounded p-1 text-ink-muted ${
          hasHover ? "opacity-0 hover:text-ink group-hover:opacity-100" : touched ? "opacity-100" : "opacity-0"
        }`}
        title={t("nav.contextMenu.moreActions")}
      >
        <Icon name="more" className="h-3.5 w-3.5" />
      </button>
      {position && <ContextMenu x={position.x} y={position.y} items={items} onClose={onClose} />}
      <ShareDialog workspaceId={workspaceId} objectId={objectId} label={t("nav.contextMenu.share")} variant="controlled" open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
