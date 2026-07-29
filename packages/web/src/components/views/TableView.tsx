import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ObjectRecord, Property } from "@notorious/shared";
import { PropertyCell } from "../properties/PropertyCell.js";

interface TableViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  visiblePropertyIds: string[];
}

/** Virtualized so a 100k-object workspace only ever renders the rows on screen. */
export function TableView({ workspaceId, items, properties, visiblePropertyIds }: TableViewProps) {
  const navigate = useNavigate();
  const parentRef = useRef<HTMLDivElement>(null);
  const columns = properties.filter((property) => visiblePropertyIds.includes(property.id));

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
            <th className="border-b border-border p-2 text-left font-medium text-ink-muted">Title</th>
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
              >
                <td className="flex-1 basis-56 p-2">
                  <button className="truncate text-left hover:underline" onClick={() => navigate(`/w/${workspaceId}/objects/${object.id}`)}>
                    {object.title || "Untitled"}
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
    </div>
  );
}
