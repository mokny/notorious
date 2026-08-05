import { useNavigate } from "react-router-dom";
import type { ObjectRecord, Property } from "@notorious/shared";
import { Icon } from "../ui/Icon.js";
import { PropertyCell } from "../properties/PropertyCell.js";

interface ListViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  visiblePropertyIds: string[];
  onOpenObject?: (objectId: string) => void;
}

export function ListView({ workspaceId, items, properties, visiblePropertyIds, onOpenObject }: ListViewProps) {
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const columns = properties.filter((property) => visiblePropertyIds.includes(property.id));

  return (
    <div className="divide-y divide-border p-2">
      {items.map((object) => (
        <div key={object.id} className="flex items-center gap-3 px-2 py-2 hover:bg-surface-raised">
          <Icon name={object.icon ?? "file-text"} className="h-4 w-4 shrink-0 text-ink-muted" />
          <button className="flex-1 truncate text-left text-sm hover:underline" onClick={() => openObject(object.id)}>
            {object.title || "Untitled"}
          </button>
          <div className="flex shrink-0 items-center gap-3">
            {columns.map((property) => (
              <div key={property.id} className="w-32">
                <PropertyCell workspaceId={workspaceId} object={object} property={property} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">No objects yet.</p>}
    </div>
  );
}
