import type { View } from "@notorious/shared";
import { useViewData } from "../../hooks/useViewData.js";
import { TableView } from "./TableView.js";
import { BoardView } from "./BoardView.js";
import { ListView } from "./ListView.js";
import { GalleryView } from "./GalleryView.js";
import { CalendarView } from "./CalendarView.js";
import { TimelineView } from "./TimelineView.js";

export function ViewRenderer({ workspaceId, view }: { workspaceId: string; view: View }) {
  const { items, properties, isLoading } = useViewData(view);

  if (isLoading) return <div className="p-6 text-sm text-ink-muted">Loading…</div>;

  switch (view.type) {
    case "table":
      return <TableView workspaceId={workspaceId} items={items} properties={properties} visiblePropertyIds={view.config.visiblePropertyIds} />;
    case "board":
      return <BoardView workspaceId={workspaceId} items={items} properties={properties} pivotPropertyId={view.config.pivotPropertyId} />;
    case "list":
      return <ListView workspaceId={workspaceId} items={items} properties={properties} visiblePropertyIds={view.config.visiblePropertyIds} />;
    case "gallery":
      return <GalleryView workspaceId={workspaceId} items={items} properties={properties} visiblePropertyIds={view.config.visiblePropertyIds} />;
    case "calendar":
      return <CalendarView workspaceId={workspaceId} items={items} properties={properties} datePropertyId={view.config.pivotPropertyId} />;
    case "timeline":
      return <TimelineView workspaceId={workspaceId} items={items} properties={properties} datePropertyId={view.config.pivotPropertyId} />;
    default:
      return null;
  }
}
