import { useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistContent, ChecklistItem } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { randomId } from "../../../lib/randomId.js";
import { Icon } from "../../ui/Icon.js";

/** Grows a textarea to fit its (possibly wrapped, no literal newlines) content instead of scrolling/clipping it - reset to "auto" first so it can shrink back down too, not just grow. */
function resizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Backfills a stable `id` on any item that doesn't have one yet - see `ChecklistItem.id`'s doc comment for why this only matters for checklists saved before drag-reordering existed. */
function withIds(items: ChecklistItem[]): ChecklistItem[] {
  return items.map((item) => (item.id ? item : { ...item, id: randomId() }));
}

function ChecklistItemRow({
  sortableId,
  item,
  onToggle,
  onToggleItem,
  onChangeText,
  onEnter,
  onRemove,
  registerInputRef,
}: {
  sortableId: string;
  item: ChecklistItem;
  onToggle: (checked: boolean) => void;
  /** Exempt-from-lock path (see ChecklistBlock's own doc comment) - used instead of `onToggle` whenever the item has a stable id to address. */
  onToggleItem?: (itemId: string, checked: boolean) => Promise<void>;
  onChangeText: (markdown: string) => void;
  onEnter: () => void;
  onRemove: () => void;
  registerInputRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const canToggleWhileLocked = Boolean(item.id && onToggleItem);

  return (
    <div ref={setNodeRef} style={style} className="group/checklistitem flex items-start gap-1">
      <button
        {...attributes}
        {...listeners}
        className="mt-1 shrink-0 cursor-grab rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-ink group-hover/checklistitem:opacity-100"
        title="Drag to reorder item"
      >
        <Icon name="grip-vertical" className="h-3.5 w-3.5" />
      </button>
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => (canToggleWhileLocked ? void onToggleItem!(item.id!, e.target.checked) : onToggle(e.target.checked))}
        // Marks this checkbox as exempt from ObjectDetailPage.tsx's
        // READ_ONLY_LOCK, which otherwise disables every `<input>` while the
        // object is locked - checking off a to-do is deliberately still
        // allowed then (see toggleChecklistItemSchema). Only set when the
        // item can actually go through the lock-exempt endpoint above; a
        // legacy item still waiting on its one-time id backfill (see
        // `withIds`) falls back to the normal, lock-blocked save path, so it
        // correctly stays disabled instead of looking clickable and
        // silently failing.
        {...(canToggleWhileLocked ? { "data-lock-exempt": "" } : {})}
        className="mt-1 h-4 w-4 shrink-0 accent-accent"
      />
      <textarea
        ref={registerInputRef}
        value={item.markdown}
        onChange={(e) => {
          onChangeText(e.target.value);
          resizeTextarea(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder="To-do"
        autoComplete="off"
        rows={1}
        className={`flex-1 resize-none overflow-hidden border-none bg-transparent py-0.5 text-sm outline-none ${
          item.checked ? "text-ink-muted line-through" : ""
        }`}
      />
      <button
        onClick={onRemove}
        // `opacity-0`, not `hidden` (its pre-drag-and-drop original state):
        // `hidden` removes it from layout entirely, so the textarea's
        // `flex-1` width recalculates the instant it appears/disappears on
        // hover - exactly the kind of end-of-line text reflow ("jumping")
        // that's disorienting to read mid-hover. Reserving its space and
        // just fading it in matches the drag handle above and every other
        // hover-reveal control in the editor (see BlockItem.tsx's own
        // delete button).
        className="mt-1 shrink-0 rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-red-500 group-hover/checklistitem:opacity-100"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ChecklistBlock({
  content: externalContent,
  onSave,
  onToggleItem,
}: {
  content: ChecklistContent;
  onSave: (c: ChecklistContent) => Promise<void>;
  /** Exempt-from-lock path for checking an item off - see toggleChecklistItemSchema. */
  onToggleItem?: (itemId: string, checked: boolean) => Promise<void>;
}) {
  const [content, save] = useDebouncedSave(externalContent, onSave);
  const items = content.items ?? [];
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    if (pendingFocusIndex === null) return;
    inputRefs.current[pendingFocusIndex]?.focus();
    setPendingFocusIndex(null);
  }, [pendingFocusIndex, items.length]);

  // Also resize on every render (not just on this tab's own typing) - an
  // item's text can change from elsewhere (another collaborator's live
  // edit, the block first loading with long saved text already in it) and
  // needs the same fit-to-content treatment either way.
  useEffect(() => {
    inputRefs.current.forEach(resizeTextarea);
  });

  // One-time backfill for checklists saved before drag-reordering existed -
  // see `withIds`. Runs again harmlessly (no-ops) once every item has one.
  useEffect(() => {
    if (items.some((item) => !item.id)) {
      void save({ ...content, items: withIds(items) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function updateItem(index: number, patch: Partial<(typeof items)[number]>) {
    save({ ...content, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  function addItem() {
    save({ ...content, items: [...items, { id: randomId(), markdown: "", checked: false }] });
    setPendingFocusIndex(items.length);
  }

  function removeItem(index: number) {
    save({ ...content, items: items.filter((_, i) => i !== index) });
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    // Matches the same `id ?? "unindexed-<n>"` fallback the rows are keyed
    // with below - a plain `item.id` lookup would miss for any item still
    // using that fallback (the brief window before the backfill effect
    // above assigns it a real one).
    const sortableIds = items.map((item, index) => item.id ?? `unindexed-${index}`);
    const oldIndex = sortableIds.indexOf(String(event.active.id));
    const newIndex = sortableIds.indexOf(String(event.over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    save({ ...content, items: arrayMove(items, oldIndex, newIndex) });
  }

  return (
    <div className="space-y-1">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item, index) => item.id ?? `unindexed-${index}`)} strategy={verticalListSortingStrategy}>
          {items.map((item, index) => (
            <ChecklistItemRow
              key={item.id ?? index}
              sortableId={item.id ?? `unindexed-${index}`}
              item={item}
              onToggle={(checked) => updateItem(index, { checked })}
              onToggleItem={onToggleItem}
              onChangeText={(markdown) => updateItem(index, { markdown })}
              onEnter={addItem}
              onRemove={() => removeItem(index)}
              registerInputRef={(el) => {
                inputRefs.current[index] = el;
                resizeTextarea(el);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button onClick={addItem} className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent">
        <Icon name="plus" className="h-3 w-3" /> Add item
      </button>
    </div>
  );
}
