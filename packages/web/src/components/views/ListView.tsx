import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ObjectRecord, Property } from "@notorious/shared";
import { Icon } from "../ui/Icon.js";
import { PropertyCell } from "../properties/PropertyCell.js";
import { useRowContextMenu } from "../../hooks/useRowContextMenu.js";
import { useTwoFingerTap } from "../../hooks/useTwoFingerTap.js";
import { ContextMenu } from "../ui/ContextMenu.js";
import { buildObjectContextMenuItems } from "../../lib/objectContextMenu.js";

interface ListViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  visiblePropertyIds: string[];
  onOpenObject?: (objectId: string) => void;
}

export function ListView({ workspaceId, items, properties, visiblePropertyIds, onOpenObject }: ListViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const columns = properties.filter((property) => visiblePropertyIds.includes(property.id));
  const rowContextMenu = useRowContextMenu();

  return (
    <div className="divide-y divide-border p-2">
      {items.map((object) => (
        <ListViewRow
          key={object.id}
          workspaceId={workspaceId}
          object={object}
          columns={columns}
          onOpen={() => openObject(object.id)}
          onContextMenu={(event) => rowContextMenu.openFromMouseEvent(object.id, event)}
          onTwoFingerTap={(x, y) => rowContextMenu.openAt(object.id, x, y)}
        />
      ))}
      {items.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">{t("views.common.noObjects")}</p>}
      {rowContextMenu.menu && (
        <ContextMenu
          x={rowContextMenu.menu.x}
          y={rowContextMenu.menu.y}
          items={buildObjectContextMenuItems(t, workspaceId, rowContextMenu.menu.objectId)}
          onClose={rowContextMenu.close}
        />
      )}
    </div>
  );
}

function ListViewRow({
  workspaceId,
  object,
  columns,
  onOpen,
  onContextMenu,
  onTwoFingerTap,
}: {
  workspaceId: string;
  object: ObjectRecord;
  columns: Property[];
  onOpen: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onTwoFingerTap: (x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const twoFingerTap = useTwoFingerTap(onTwoFingerTap);

  return (
    <div
      onContextMenu={onContextMenu}
      {...twoFingerTap}
      className="flex items-center gap-3 px-2 py-2 hover:bg-surface-raised"
    >
      <Icon name={object.icon ?? "file-text"} className="h-4 w-4 shrink-0 text-ink-muted" />
      <button className="flex-1 truncate text-left text-sm hover:underline" onClick={onOpen}>
        {object.title || t("nav.untitled")}
      </button>
      <div className="flex shrink-0 items-center gap-3">
        {columns.map((property) => (
          <div key={property.id} className="w-32">
            <PropertyCell workspaceId={workspaceId} object={object} property={property} />
          </div>
        ))}
      </div>
    </div>
  );
}
