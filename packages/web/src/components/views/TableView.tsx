import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ObjectRecord, Property } from "@notorious/shared";
import { PropertyCell } from "../properties/PropertyCell.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { useRowContextMenu } from "../../hooks/useRowContextMenu.js";
import { ContextMenu } from "../ui/ContextMenu.js";
import { buildObjectContextMenuItems } from "../../lib/objectContextMenu.js";

interface TableViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  visiblePropertyIds: string[];
  /** Overrides the default full-navigation row click - used for the tablet split view (see ObjectTypePage/SearchPage). */
  onOpenObject?: (objectId: string) => void;
}

export function TableView(props: TableViewProps) {
  const breakpoint = useBreakpoint();
  // A table doesn't reflow onto a phone screen - a horizontally-scrolling
  // grid of tiny cells isn't usable there, so it becomes a stacked list of
  // cards instead (one per object, properties as label/value pairs).
  return breakpoint === "phone" ? <TableViewCards {...props} /> : <TableViewGrid {...props} />;
}

function TableViewCards({ workspaceId, items, properties, visiblePropertyIds, onOpenObject }: TableViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const columns = properties.filter((property) => visiblePropertyIds.includes(property.id));
  const rowContextMenu = useRowContextMenu();

  return (
    <div className="h-full space-y-2 overflow-auto p-3">
      {items.map((object) => (
        <div
          key={object.id}
          onContextMenu={(event) => rowContextMenu.openFromMouseEvent(object.id, event)}
          className="rounded-lg border border-border bg-surface-raised p-3"
        >
          <button onClick={() => openObject(object.id)} className="block w-full truncate text-left text-sm font-medium hover:underline">
            {object.title || t("nav.untitled")}
          </button>
          {columns.length > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-border pt-2">
              {columns.map((property) => (
                <div key={property.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="shrink-0 text-xs text-ink-muted">{property.name}</span>
                  <span className="min-w-0 truncate text-right">
                    <PropertyCell workspaceId={workspaceId} object={object} property={property} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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

/** Virtualized so a 100k-object workspace only ever renders the rows on screen. */
function TableViewGrid({ workspaceId, items, properties, visiblePropertyIds, onOpenObject }: TableViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = properties.filter((property) => visiblePropertyIds.includes(property.id));
  const rowContextMenu = useRowContextMenu();

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="border-b border-border p-2 text-left font-medium text-ink-muted">{t("views.table.title")}</th>
            {columns.map((property) => (
              <th key={property.id} className="border-b border-border p-2 text-left font-medium text-ink-muted">
                {property.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ height: virtualizer.getTotalSize(), position: "relative", display: "block" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const object = items[virtualRow.index]!;
            return (
              <tr
                key={object.id}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                className="flex border-b border-border hover:bg-surface-raised"
                onContextMenu={(event) => rowContextMenu.openFromMouseEvent(object.id, event)}
              >
                <td className="flex-1 basis-56 p-2">
                  <button className="truncate text-left hover:underline" onClick={() => openObject(object.id)}>
                    {object.title || t("nav.untitled")}
                  </button>
                </td>
                {columns.map((property) => (
                  <td key={property.id} className="flex-1 basis-40 p-2">
                    <PropertyCell workspaceId={workspaceId} object={object} property={property} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
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
