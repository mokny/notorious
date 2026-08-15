import type { TFunction } from "i18next";
import type { ContextMenuEntry } from "../components/ui/ContextMenu.js";

/**
 * Right-click/long-press menu items for a row/card in any of the six views
 * (Board/Table/List/Calendar/Gallery/Timeline) - currently just "Copy link",
 * the one row action that already makes sense everywhere (views have no
 * existing per-row action menu of their own to fold in, see BoardView.tsx
 * and friends). Copies the *internal* app link, not a public share token -
 * only useful to someone who already has access to this workspace, unlike
 * ShareDialog.tsx's revocable public links.
 */
export function buildObjectContextMenuItems(t: TFunction, workspaceId: string, objectId: string): ContextMenuEntry[] {
  return [
    {
      key: "copy-link",
      label: t("views.common.contextMenu.copyLink"),
      icon: "link",
      onSelect: () => {
        void navigator.clipboard.writeText(`${window.location.origin}/w/${workspaceId}/objects/${objectId}`);
      },
    },
  ];
}

export interface SidebarObjectMenuState {
  workspaceId: string;
  objectId: string;
  pinned: boolean;
  locked: boolean;
  archived: boolean;
  /** Editor-or-above membership - gates Archive/Restore/Delete. */
  canEdit: boolean;
  /** Owner-only - gates Lock/Unlock, same tier as the lock button on ObjectDetailPage.tsx. */
  isOwner: boolean;
}

export interface SidebarObjectMenuActions {
  togglePin: () => void;
  setLocked: (locked: boolean) => void;
  archive: () => void;
  restore: () => void;
  openShare: () => void;
  deleteObject: () => void;
}

/**
 * Right-click/"..."-button menu for a pinned/recent/recently-edited row in
 * the sidebar (see grill-me spec) - a superset of buildObjectContextMenuItems
 * above (which stays as-is for view rows/cards). Mutating entries are
 * entirely omitted rather than disabled for a role that can't use them, same
 * principle as BlockContextMenu.tsx's reduced set for a locked block; a
 * locked object drops Archive/Delete the same way for the same reason (its
 * lock blocks edits for everyone, including the owner).
 */
export function buildSidebarObjectContextMenuItems(
  t: TFunction,
  state: SidebarObjectMenuState,
  actions: SidebarObjectMenuActions,
): ContextMenuEntry[] {
  const { workspaceId, objectId, pinned, locked, archived, canEdit, isOwner } = state;
  const canMutateContent = canEdit && !locked;

  const items: ContextMenuEntry[] = [
    {
      key: "open-new-tab",
      label: t("nav.contextMenu.openInNewTab"),
      icon: "external-link",
      onSelect: () => window.open(`${window.location.origin}/w/${workspaceId}/objects/${objectId}`, "_blank"),
    },
    {
      key: "copy-link",
      label: t("views.common.contextMenu.copyLink"),
      icon: "link",
      onSelect: () => {
        void navigator.clipboard.writeText(`${window.location.origin}/w/${workspaceId}/objects/${objectId}`);
      },
    },
    {
      key: "pin",
      label: pinned ? t("nav.contextMenu.unpin") : t("nav.contextMenu.pin"),
      icon: pinned ? "pin-off" : "pin",
      onSelect: actions.togglePin,
    },
  ];

  if (isOwner) {
    items.push({
      key: "lock",
      label: locked ? t("nav.contextMenu.unlock") : t("nav.contextMenu.lock"),
      icon: locked ? "unlock" : "lock",
      onSelect: () => actions.setLocked(!locked),
    });
  }

  if (canMutateContent) {
    items.push({
      key: "archive",
      label: archived ? t("nav.contextMenu.restore") : t("nav.contextMenu.archive"),
      icon: archived ? "archive-restore" : "archive",
      onSelect: archived ? actions.restore : actions.archive,
    });
  }

  items.push({ key: "sep-share", separator: true });
  items.push({ key: "share", label: t("nav.contextMenu.share"), icon: "share", onSelect: actions.openShare });

  if (canMutateContent) {
    items.push({ key: "sep-delete", separator: true });
    items.push({ key: "delete", label: t("nav.contextMenu.delete"), icon: "trash", danger: true, onSelect: actions.deleteObject });
  }

  return items;
}
