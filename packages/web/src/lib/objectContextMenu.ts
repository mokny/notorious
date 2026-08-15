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
