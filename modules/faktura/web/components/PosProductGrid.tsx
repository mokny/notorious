import { useMemo, useState, type PointerEvent } from "react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatCents } from "@notorious/shared";
import { useDragSelectGuard } from "../../../../packages/web/src/hooks/useDragSelectGuard.js";
import { resolveProductColor, PRODUCT_TILE_TEXT_CLASS } from "../lib/posColor.js";
import type { ProductListItemDto } from "../api.js";

const UNCATEGORIZED = "Sonstiges";
const FAVORITES_TAB = "__favorites__";

/** Kategorie-Kacheln (inkl. fest angehefteter "Favoriten"-Reiter) + Touch-Produkt-Kacheln für den Kassenbildschirm - siehe web/pages/PosTerminalPage.tsx. Kacheln sind per Long-Press (dnd-kit, gleiches Pattern wie WorkspaceRail.tsx) innerhalb des Rasters verschiebbar; die neue Reihenfolge wird über `onReorder` persistiert. */
export function PosProductGrid(props: {
  products: ProductListItemDto[];
  onAdd: (product: ProductListItemDto) => void;
  onReorder: (productId: string, afterProductId: string | null) => void;
}) {
  const categories = useMemo(() => {
    const set = new Set(props.products.map((p) => p.posCategory || UNCATEGORIZED));
    return Array.from(set).sort();
  }, [props.products]);
  const hasFavorites = props.products.some((p) => p.posFavorite);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const effectiveTab = activeTab ?? (hasFavorites ? FAVORITES_TAB : categories[0]) ?? null;

  const visibleProducts =
    effectiveTab === FAVORITES_TAB
      ? props.products.filter((p) => p.posFavorite)
      : props.products.filter((p) => (p.posCategory || UNCATEGORIZED) === effectiveTab);
  const visibleIds = useMemo(() => visibleProducts.map((p) => p.id), [visibleProducts]);

  const dragSelectGuard = useDragSelectGuard();
  // Mouse: near-instant drag on 4px movement. Touch: a genuine long-press
  // (200ms hold) is required first, so a plain tap still adds the product
  // to the cart instead of being mistaken for the start of a drag - same
  // constraints as WorkspaceRail.tsx's drag-reorderable list.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    dragSelectGuard.onDragEnd();
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = visibleIds.indexOf(String(event.active.id));
    const newIndex = visibleIds.indexOf(String(event.over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(visibleIds, oldIndex, newIndex);
    const draggedIndex = reordered.indexOf(String(event.active.id));
    const afterProductId = draggedIndex > 0 ? reordered[draggedIndex - 1]! : null;
    props.onReorder(String(event.active.id), afterProductId);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {hasFavorites && (
          <button
            type="button"
            onClick={() => setActiveTab(FAVORITES_TAB)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              effectiveTab === FAVORITES_TAB ? "bg-accent text-white" : "bg-surface-hover text-ink"
            }`}
          >
            ★ Favoriten
          </button>
        )}
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveTab(category)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              category === effectiveTab ? "bg-accent text-white" : "bg-surface-hover text-ink"
            }`}
          >
            {category}
          </button>
        ))}
      </div>
      <DndContext sensors={sensors} onDragStart={dragSelectGuard.onDragStart} onDragCancel={dragSelectGuard.onDragCancel} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="mt-3 grid flex-1 grid-cols-4 content-start gap-2 overflow-y-auto sm:grid-cols-5 lg:grid-cols-6">
            {visibleProducts.map((product) => (
              <PosProductTile key={product.id} product={product} onAdd={props.onAdd} onTouchArmStart={dragSelectGuard.onTouchArmStart} />
            ))}
            {visibleProducts.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-ink-muted">Keine Produkte in dieser Kategorie.</p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PosProductTile(props: {
  product: ProductListItemDto;
  onAdd: (product: ProductListItemDto) => void;
  onTouchArmStart: (event: PointerEvent) => void;
}) {
  const { product } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const background = resolveProductColor(product.id, product.posColor);

  return (
    <button
      ref={setNodeRef}
      style={{ ...style, backgroundColor: background }}
      {...attributes}
      {...listeners}
      onPointerDownCapture={props.onTouchArmStart}
      type="button"
      onClick={() => props.onAdd(product)}
      className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg p-2 text-center active:brightness-95 ${PRODUCT_TILE_TEXT_CLASS}`}
    >
      <span className="line-clamp-2 text-xs font-medium leading-tight">{product.name}</span>
      <span className="text-xs opacity-90">{formatCents(product.basePriceCents)}</span>
    </button>
  );
}
