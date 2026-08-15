import { useMemo, type MouseEvent as ReactMouseEvent, type PointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { ObjectRecord, Property, PropertyOption } from "@notorious/shared";
import { useObjectMutations } from "../../hooks/useObjectMutations.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { useDragSelectGuard } from "../../hooks/useDragSelectGuard.js";
import { useRowContextMenu } from "../../hooks/useRowContextMenu.js";
import { useTwoFingerTap } from "../../hooks/useTwoFingerTap.js";
import { ContextMenu } from "../ui/ContextMenu.js";
import { buildObjectContextMenuItems } from "../../lib/objectContextMenu.js";

interface BoardViewProps {
  workspaceId: string;
  items: ObjectRecord[];
  properties: Property[];
  pivotPropertyId: string | null | undefined;
  /** Overrides the default full-navigation card click - used for the tablet split view (see ObjectTypePage/SearchPage). */
  onOpenObject?: (objectId: string) => void;
}

const UNASSIGNED = "__unassigned__";

export function BoardView({ workspaceId, items, properties, pivotPropertyId, onOpenObject }: BoardViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openObject = onOpenObject ?? ((objectId: string) => navigate(`/w/${workspaceId}/objects/${objectId}`));
  const mutations = useObjectMutations(workspaceId);
  const breakpoint = useBreakpoint();
  // Columns can't scroll sideways on a phone screen - they stack full-width
  // and the user scrolls down through them instead (same reasoning as
  // TableView's card fallback).
  const stacked = breakpoint === "phone";
  // Same split as the block editor's drag handles: mouse drags start on a
  // tiny movement, touch needs a short long-press first so a plain tap
  // doesn't get mistaken for the user scrolling the (now vertical) column.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  const dragSelectGuard = useDragSelectGuard();
  const rowContextMenu = useRowContextMenu();
  const pivot = properties.find((p) => p.id === pivotPropertyId);
  const options: PropertyOption[] = useMemo(
    () => (pivot && "options" in pivot.config ? pivot.config.options : []),
    [pivot],
  );

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
    return <p className="p-6 text-sm text-ink-muted">{t("views.board.noPivotProperty")}</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={dragSelectGuard.onDragStart}
      onDragCancel={dragSelectGuard.onDragCancel}
      onDragEnd={(event) => {
        dragSelectGuard.onDragEnd();
        handleDragEnd(event);
      }}
    >
      <div className={stacked ? "flex h-full flex-col gap-4 overflow-y-auto p-4" : "flex h-full gap-4 overflow-x-auto p-4"}>
        <BoardColumn
          id={UNASSIGNED}
          title={t("views.board.noStatus")}
          color="#94a3b8"
          items={columns.get(UNASSIGNED) ?? []}
          onOpenObject={openObject}
          stacked={stacked}
          onTouchArmStart={dragSelectGuard.onTouchArmStart}
          onCardContextMenu={rowContextMenu.openFromMouseEvent}
          onCardTwoFingerTap={rowContextMenu.openAt}
        />
        {options.map((option) => (
          <BoardColumn
            key={option.id}
            id={option.id}
            title={option.label}
            color={option.color}
            items={columns.get(option.id) ?? []}
            onOpenObject={openObject}
            stacked={stacked}
            onTouchArmStart={dragSelectGuard.onTouchArmStart}
            onCardContextMenu={rowContextMenu.openFromMouseEvent}
            onCardTwoFingerTap={rowContextMenu.openAt}
          />
        ))}
      </div>
      {rowContextMenu.menu && (
        <ContextMenu
          x={rowContextMenu.menu.x}
          y={rowContextMenu.menu.y}
          items={buildObjectContextMenuItems(t, workspaceId, rowContextMenu.menu.objectId)}
          onClose={rowContextMenu.close}
        />
      )}
    </DndContext>
  );
}

function BoardColumn({
  id,
  title,
  color,
  items,
  onOpenObject,
  stacked,
  onTouchArmStart,
  onCardContextMenu,
  onCardTwoFingerTap,
}: {
  id: string;
  title: string;
  color: string;
  items: ObjectRecord[];
  onOpenObject: (objectId: string) => void;
  stacked: boolean;
  onTouchArmStart: (event: PointerEvent) => void;
  onCardContextMenu: (objectId: string, event: ReactMouseEvent) => void;
  onCardTwoFingerTap: (objectId: string, x: number, y: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border border-border p-2 ${stacked ? "w-full" : "w-64 shrink-0"} ${isOver ? "bg-accent/5" : "bg-surface-raised"}`}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="ml-auto text-xs text-ink-muted">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <BoardCard
            key={item.id}
            item={item}
            onOpen={() => onOpenObject(item.id)}
            onTouchArmStart={onTouchArmStart}
            onContextMenu={(event) => onCardContextMenu(item.id, event)}
            onTwoFingerTap={(x, y) => onCardTwoFingerTap(item.id, x, y)}
          />
        ))}
      </div>
    </div>
  );
}

function BoardCard({
  item,
  onOpen,
  onTouchArmStart,
  onContextMenu,
  onTwoFingerTap,
}: {
  item: ObjectRecord;
  onOpen: () => void;
  onTouchArmStart: (event: PointerEvent) => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  onTwoFingerTap: (x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const twoFingerTap = useTwoFingerTap(onTwoFingerTap);
  // dnd-kit's TouchSensor activates via a plain `onTouchStart` prop, same as
  // useTwoFingerTap's own detector - spreading both directly would have the
  // second silently clobber the first's `onTouchStart` (an object spread,
  // not a listener list), breaking touch drag outright. Calling both
  // explicitly is what actually lets a single-finger long-press still start
  // a drag while a second finger touching down is what useTwoFingerTap is
  // watching for.
  function handleTouchStart(event: ReactTouchEvent): void {
    listeners?.onTouchStart?.(event);
    twoFingerTap.onTouchStart(event);
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      {...twoFingerTap}
      onTouchStart={handleTouchStart}
      onPointerDownCapture={onTouchArmStart}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 10 } : undefined}
      className={`cursor-pointer rounded-lg border border-border bg-surface p-2.5 text-sm shadow-sm hover:ring-2 hover:ring-accent/30 ${isDragging ? "opacity-60" : ""}`}
    >
      {item.title || t("nav.untitled")}
    </div>
  );
}
