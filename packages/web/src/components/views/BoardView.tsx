import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { ObjectRecord, Property, PropertyOption } from "@notorious/shared";
import { useObjectMutations } from "../../hooks/useObjectMutations.js";

interface BoardViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  pivotPropertyId: string | null | undefined;
}

const UNASSIGNED = "__unassigned__";

export function BoardView({ workspaceId, items, properties, pivotPropertyId }: BoardViewProps) {
  const navigate = useNavigate();
  const mutations = useObjectMutations(workspaceId);
  const pivot = properties.find((p) => p.id === pivotPropertyId);
  const options: PropertyOption[] = pivot && "options" in pivot.config ? pivot.config.options : [];

  const columns = useMemo(() => {
    const groups = new Map<string, ObjectRecord[]>([UNASSIGNED, ...options.map((o) => o.id)].map((id) => [id, []]));
    for (const item of items) {
      const value = pivot ? item.values[pivot.key] : null;
      const key = typeof value === "string" && groups.has(value) ? value : UNASSIGNED;
      groups.get(key)!.push(item);
    }
    return groups;
  }, [items, options, pivot]);

  function handleDragEnd(event: DragEndEvent) {
    if (!pivot || !event.over) return;
    const objectId = String(event.active.id);
    const columnId = String(event.over.id);
    void mutations.updateValue(objectId, pivot.key, columnId === UNASSIGNED ? null : columnId);
  }

  if (!pivot) {
    return <p className="p-6 text-sm text-ink-muted">Pick a status/select property as this board's column property in view settings.</p>;
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        <BoardColumn id={UNASSIGNED} title="No status" color="#94a3b8" items={columns.get(UNASSIGNED) ?? []} workspaceId={workspaceId} navigate={navigate} />
        {options.map((option) => (
          <BoardColumn
            key={option.id}
            id={option.id}
            title={option.label}
            color={option.color}
            items={columns.get(option.id) ?? []}
            workspaceId={workspaceId}
            navigate={navigate}
          />
        ))}
      </div>
    </DndContext>
  );
}

function BoardColumn({
  id,
  title,
  color,
  items,
  workspaceId,
  navigate,
}: {
  id: string;
  title: string;
  color: string;
  items: ObjectRecord[];
  workspaceId: string;
  navigate: (path: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`w-64 shrink-0 rounded-xl border border-border p-2 ${isOver ? "bg-accent/5" : "bg-surface-raised"}`}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="ml-auto text-xs text-ink-muted">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <BoardCard key={item.id} item={item} onOpen={() => navigate(`/w/${workspaceId}/objects/${item.id}`)} />
        ))}
      </div>
    </div>
  );
}

function BoardCard({ item, onOpen }: { item: ObjectRecord; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 10 } : undefined}
      className={`cursor-pointer rounded-lg border border-border bg-surface p-2.5 text-sm shadow-sm hover:ring-2 hover:ring-accent/30 ${isDragging ? "opacity-60" : ""}`}
    >
      {item.title || "Untitled"}
    </div>
  );
}
