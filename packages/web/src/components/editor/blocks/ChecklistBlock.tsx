import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ChecklistContent, ChecklistItem } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { useDragSelectGuard } from "../../../hooks/useDragSelectGuard.js";
import { useHasHover } from "../../../hooks/useHasHover.js";
import { useClickOutside } from "../../../hooks/useClickOutside.js";
import { useKeepInViewport } from "../../../hooks/useKeepInViewport.js";
import { randomId } from "../../../lib/randomId.js";
import { Icon } from "../../ui/Icon.js";
import { useBlockEditor } from "../BlockEditorContext.js";
import { useTemplatableField } from "../useTemplatableField.js";
import { SWIPE_DELETE_THRESHOLD_PX, TAP_MOVEMENT_TOLERANCE_PX } from "../blockGestures.js";
import { UndoToast } from "../UndoToast.js";
import { HighlightedText } from "../HighlightedText.js";

/** Grows a textarea to fit its (possibly wrapped, no literal newlines) content instead of scrolling/clipping it - reset to "auto" first so it can shrink back down too, not just grow. */
function resizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Delay before a checked-off item slides to the bottom - see ChecklistContent.sortCheckedToBottom. */
const CHECKED_MOVE_DELAY_MS = 2000;

function ChecklistSettingsPopover({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setOpen(false), open);
  const clampStyle = useKeepInViewport(popoverRef, open);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Checklist settings"
        className="shrink-0 rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-ink group-hover/block:opacity-100"
      >
        <Icon name="settings" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          style={clampStyle}
          className="absolute right-0 z-50 mt-1 w-64 space-y-2 rounded-lg border border-border bg-surface-raised p-2 shadow-lg"
        >
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" className="accent-accent" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
            Move checked items to the bottom after 2s
          </label>
        </div>
      )}
    </div>
  );
}

/** Backfills a stable `id` on any item that doesn't have one yet - see `ChecklistItem.id`'s doc comment for why this only matters for checklists saved before drag-reordering existed. */
function withIds(items: ChecklistItem[]): ChecklistItem[] {
  return items.map((item) => (item.id ? item : { ...item, id: randomId() }));
}

function ChecklistItemRow({
  sortableId,
  blockId,
  field,
  item,
  onToggle,
  onToggleItem,
  onChangeText,
  onEnter,
  onRemove,
  onFlush,
  registerInputRef,
  readOnly,
  searchTerms,
}: {
  sortableId: string;
  /** This item's owning block id and its key in `renderedBlocks` (`items.<index>` - see modules/templates/renderer.ts and useTemplatableField.ts). */
  blockId: string;
  field: string;
  item: ChecklistItem;
  onToggle: (checked: boolean) => void;
  /** Exempt-from-lock path (see ChecklistBlock's own doc comment) - used instead of `onToggle` whenever the item has a stable id to address. */
  onToggleItem?: (itemId: string, checked: boolean) => Promise<void>;
  onChangeText: (markdown: string) => void;
  onEnter: () => void;
  onRemove: () => void;
  /** Saves a pending edit right away on blur instead of waiting out the rest of useDebouncedSave's window - see RichTextEditor.tsx's identical onBlur flush, which this matches for consistency. */
  onFlush: () => void;
  registerInputRef: (el: HTMLTextAreaElement | null) => void;
  /** Native `readOnly`, not `disabled` - keeps the item's text selectable/copyable while the object is locked (see BlockEditorContext.tsx and readOnlyContent.ts's `:not([readonly])` carve-out), unlike the checkbox above, which stays interactive either way. */
  readOnly: boolean;
  /** See BlockEditorContext.tsx's `searchHighlight` - checklist items aren't TipTap instances, so they can't use SearchHighlight.ts's decorations (see HighlightedText.tsx). */
  searchTerms: string[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  // Same touch-vs-hover split as BlockItem.tsx: no real hover means the
  // handle/delete buttons disappear entirely (not just opacity-hidden) to
  // reclaim the width they always reserved, and the whole row becomes the
  // long-press drag source instead.
  const hasHover = useHasHover();
  const [isEditingContent, setIsEditingContent] = useState(false);
  const canLongPressDrag = !hasHover && !readOnly && !isEditingContent;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && hasHover ? 0.5 : 1,
    boxShadow: isDragging && !hasHover ? "0 8px 24px rgb(0 0 0 / 0.25)" : undefined,
    // See BlockItem.tsx's identical property - suppresses iOS's own
    // long-press link-preview popup so it doesn't win the race against this
    // row's own long-press-drag gesture.
    WebkitTouchCallout: !hasHover ? ("none" as const) : undefined,
  };
  // Same 0-1 delete-reveal fraction as BlockItem.tsx, see blockGestures.ts.
  const deleteRevealProgress =
    isDragging && !hasHover && transform && transform.x < 0 ? Math.min(1, -transform.x / SWIPE_DELETE_THRESHOLD_PX) : 0;
  const canToggleWhileLocked = Boolean(item.id && onToggleItem);
  const { rendered, showRendered, startEditing, stopEditing } = useTemplatableField(blockId, field);
  // useTemplatableField's own `showRendered` only ever fires for a
  // *templated* field (`rendered !== undefined` - see its own doc comment),
  // which most checklist items aren't - so on its own it would never show
  // search highlighting for the common case. This is a second, independent
  // rendered/editable swap purely for that: shows a highlighted plain-text
  // preview instead of the textarea whenever there are active search terms,
  // until the user clicks in to actually edit (mirrors the templated
  // rendered-until-clicked UX below). Reset on blur so it goes back to
  // showing the highlight once editing ends.
  const [searchPreviewOverridden, setSearchPreviewOverridden] = useState(false);
  const showSearchPreview = !showRendered && searchTerms.length > 0 && !searchPreviewOverridden;
  // Only autofocus the textarea after the *user* clicked the rendered text
  // to start editing it - not on every mount, which would otherwise steal
  // focus from whatever else is on the page whenever a templated item first
  // renders in its rendered state.
  const focusOnEditRef = useRef(false);

  return (
    <div className="relative" data-flip-id={sortableId}>
      {deleteRevealProgress > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 flex w-24 items-center justify-end rounded-md bg-red-500 pr-4 text-white"
          style={{ opacity: deleteRevealProgress }}
        >
          <Icon name="close" className="h-4 w-4" />
        </div>
      )}
      <div
        ref={setNodeRef}
        style={style}
        onFocus={() => setIsEditingContent(true)}
        onBlur={() => setIsEditingContent(false)}
        {...(canLongPressDrag ? listeners : {})}
        className={`group/checklistitem relative flex items-start gap-1 ${!hasHover ? "bg-surface" : ""} ${
          isDragging && !hasHover ? "z-10 scale-[1.02]" : ""
        }`}
      >
        {hasHover && (
          <button
            {...attributes}
            {...listeners}
            className="mt-1 shrink-0 cursor-grab rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-ink group-hover/checklistitem:opacity-100"
            title="Drag to reorder item"
          >
            <Icon name="grip-vertical" className="h-3.5 w-3.5" />
          </button>
        )}
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
          className="mt-1 shrink-0 accent-accent"
        />
        {showRendered ? (
          <div
            onClick={() => {
              focusOnEditRef.current = true;
              startEditing();
            }}
            className={`flex-1 py-0.5 text-sm ${readOnly ? "" : "cursor-text"} ${item.checked ? "text-ink-muted line-through" : ""}`}
          >
            <HighlightedText text={rendered || item.markdown || ""} terms={searchTerms} />
          </div>
        ) : showSearchPreview ? (
          <div
            onClick={() => {
              if (readOnly) return;
              focusOnEditRef.current = true;
              setSearchPreviewOverridden(true);
            }}
            className={`flex-1 py-0.5 text-sm ${readOnly ? "" : "cursor-text"} ${item.checked ? "text-ink-muted line-through" : ""}`}
          >
            <HighlightedText text={item.markdown || ""} terms={searchTerms} />
          </div>
        ) : (
          <textarea
            ref={(el) => {
              registerInputRef(el);
              if (el && focusOnEditRef.current) {
                el.focus();
                focusOnEditRef.current = false;
              }
            }}
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
            // Without this, a *brand-new* item (never opened via clicking a
            // rendered value, so `editing` never otherwise turns true) could
            // have its debounced save+refetch land while still focused and
            // being typed into - `showRendered` would flip true right out
            // from under the cursor the instant a rendered value first
            // appears, exactly the "focus jumps out of a checklist item
            // right after creating it" bug this fixes.
            onFocus={startEditing}
            onBlur={() => {
              onFlush();
              stopEditing();
              setSearchPreviewOverridden(false);
            }}
            readOnly={readOnly}
            placeholder="To-do"
            autoComplete="off"
            rows={1}
            className={`flex-1 resize-none overflow-hidden border-none bg-transparent py-0.5 text-sm outline-none ${
              item.checked ? "text-ink-muted line-through" : ""
            }`}
          />
        )}
        {hasHover && (
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
        )}
      </div>
    </div>
  );
}

export function ChecklistBlock({
  blockId,
  content: externalContent,
  onSave,
  onToggleItem,
  onReorderItems,
}: {
  blockId: string;
  content: ChecklistContent;
  onSave: (c: ChecklistContent) => Promise<void>;
  /** Exempt-from-lock path for checking an item off - see toggleChecklistItemSchema. */
  onToggleItem?: (itemId: string, checked: boolean) => Promise<void>;
  /** Exempt-from-lock path for the `sortCheckedToBottom` auto-sort reorder below - see reorderChecklistItemsSchema. `save()`'s own generic PATCH isn't exempt, so on a locked object it would otherwise persist the checkbox toggle but silently lose the reorder that's supposed to follow it - this is called alongside `save()` (not instead of it) so the common unlocked case keeps its single normal write, and the locked case still gets the reorder committed by this one when the other 423s. */
  onReorderItems?: (itemIds: string[]) => Promise<void>;
}) {
  const { readOnly, searchHighlight } = useBlockEditor();
  const [content, save, flushSave] = useDebouncedSave(externalContent, onSave);
  const items = useMemo(() => content.items ?? [], [content.items]);
  const searchTerms = searchHighlight?.terms ?? [];
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
  // Split by input type, same reasoning as BlockEditor.tsx's own sensors:
  // mouse keeps the near-instant 4px-movement drag start (from the handle
  // only), touch needs a short long-press first since the whole row is now
  // the drag source (see ChecklistItemRow's canLongPressDrag) and a plain
  // tap-drag anywhere on it must not get mistaken for scrolling the page.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  const dragSelectGuard = useDragSelectGuard();
  // Touch-only swipe-delete undo, mirroring BlockEditor.tsx's
  // performSwipeDelete - a local snapshot instead of that history stack
  // (checklist items aren't part of it), since the toast's job here is just
  // giving the same "oops" recovery window for the same new gesture.
  const [undoSnapshot, setUndoSnapshot] = useState<{ index: number; item: ChecklistItem } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortCheckedToBottom = content.sortCheckedToBottom ?? false;
  // Always-current `items` for the setTimeout callbacks below, which close
  // over whatever `items` was at schedule time otherwise - a stale array
  // would silently undo any edit/reorder that happened during the 2s wait.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const moveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Items this feature itself moved to the bottom, so unchecking them again
  // knows to jump back to the top - a manual drag away from the bottom (see
  // handleDragEnd) clears an item out of this set, since it's no longer in
  // the "parked at the bottom by auto-sort" state that jump should undo.
  const movedToBottomRef = useRef<Set<string>>(new Set());
  // New items added while `sortCheckedToBottom` is on, waiting to jump above
  // the first checked item once the user is done editing them (see
  // `finishEditingNewItem`) - kept separate from `movedToBottomRef` since a
  // brand-new item hasn't been auto-moved *to the bottom* at all, it starts
  // there and is due to move *up*.
  const pendingNewItemsRef = useRef<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  // Set right before an auto-sort reorder's `save()` call, to the rows'
  // pre-reorder positions - the layout effect below diffs against the
  // post-reorder DOM and FLIP-animates the delta. Left `null` for every
  // other kind of reorder (drag, add, remove), which already have their own
  // (or no) transition.
  const flipPrevRectsRef = useRef<Map<string, DOMRect> | null>(null);

  useEffect(() => () => moveTimersRef.current.forEach((t) => clearTimeout(t)), []);

  function captureRowRects(): Map<string, DOMRect> {
    const map = new Map<string, DOMRect>();
    listRef.current?.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((el) => {
      map.set(el.dataset.flipId!, el.getBoundingClientRect());
    });
    return map;
  }

  useLayoutEffect(() => {
    const prevRects = flipPrevRectsRef.current;
    if (!prevRects) return;
    flipPrevRectsRef.current = null;
    listRef.current?.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((el) => {
      const before = prevRects.get(el.dataset.flipId!);
      if (!before) return;
      const deltaY = before.top - el.getBoundingClientRect().top;
      if (!deltaY) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${deltaY}px)`;
      el.getBoundingClientRect(); // forces a reflow so the line below animates from this transform, not the target one
      requestAnimationFrame(() => {
        el.style.transition = "transform 300ms ease";
        el.style.transform = "";
      });
    });
  }, [items]);

  function clearMoveTimer(itemId: string): void {
    const timer = moveTimersRef.current.get(itemId);
    if (timer) {
      clearTimeout(timer);
      moveTimersRef.current.delete(itemId);
    }
  }

  /** Blurs whatever's still focused inside an item's row (almost always its own checkbox, left focused by the click that checked it off) right before that row moves - React reorders by key rather than remounting the DOM node, so a still-focused control would otherwise still be focused after the move, and desktop Chrome scrolls a focused element into view the instant its layout position changes. `overflow-anchor: none` on the list only suppresses *scroll-anchoring*, a different browser mechanism, so it doesn't stop this. */
  function blurFocusWithinRow(itemId: string): void {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-flip-id="${itemId}"]`);
    if (row && document.activeElement instanceof HTMLElement && row.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  /** Persists a reordered `items` array via the normal debounced `save()` *and*, if every item already has a stable id, the lock-exempt `onReorderItems` - see that prop's own doc comment for why both. */
  function persistReorder(nextItems: ChecklistItem[]): void {
    save({ ...content, items: nextItems });
    flushSave();
    const itemIds = nextItems.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (itemIds.length === nextItems.length) onReorderItems?.(itemIds).catch(() => {});
  }

  function scheduleMoveToBottom(itemId: string): void {
    clearMoveTimer(itemId);
    moveTimersRef.current.set(
      itemId,
      setTimeout(() => {
        moveTimersRef.current.delete(itemId);
        const current = itemsRef.current;
        const index = current.findIndex((item) => item.id === itemId);
        const target = current[index];
        if (!target) return;
        movedToBottomRef.current.add(itemId);
        blurFocusWithinRow(itemId);
        flipPrevRectsRef.current = captureRowRects();
        persistReorder([...current.slice(0, index), ...current.slice(index + 1), target]);
      }, CHECKED_MOVE_DELAY_MS),
    );
  }

  /** Called on every check/uncheck of an item, from either toggle path (see the two `onToggle*` props below) - schedules or cancels the delayed move-to-bottom, or jumps a parked item back to the top on uncheck. No-op unless `sortCheckedToBottom` is on. */
  function handleCheckedChange(itemId: string | undefined, checked: boolean): void {
    if (!itemId || !sortCheckedToBottom) return;
    if (checked) {
      scheduleMoveToBottom(itemId);
      return;
    }
    clearMoveTimer(itemId);
    if (!movedToBottomRef.current.delete(itemId)) return;
    const current = itemsRef.current;
    const index = current.findIndex((item) => item.id === itemId);
    const target = current[index];
    if (index <= 0 || !target) return;
    blurFocusWithinRow(itemId);
    flipPrevRectsRef.current = captureRowRects();
    persistReorder([target, ...current.slice(0, index), ...current.slice(index + 1)]);
  }

  /** Called when a new item's textarea loses focus - moves it above the first checked item if it's still waiting on that from `addItem` (a no-op for every other blur). Deliberately not tied to the check/uncheck timer above: a brand-new item should wait for the user to actually finish typing it, not jump out from under them mid-edit. */
  function finishEditingNewItem(itemId: string | undefined): void {
    if (!itemId || !pendingNewItemsRef.current.delete(itemId) || !sortCheckedToBottom) return;
    const current = itemsRef.current;
    const index = current.findIndex((item) => item.id === itemId);
    const firstCheckedIndex = current.findIndex((item) => item.checked);
    if (index === -1 || firstCheckedIndex === -1 || firstCheckedIndex >= index) return;
    const target = current[index];
    if (!target) return;
    flipPrevRectsRef.current = captureRowRects();
    const without = [...current.slice(0, index), ...current.slice(index + 1)];
    save({ ...content, items: [...without.slice(0, firstCheckedIndex), target, ...without.slice(firstCheckedIndex)] });
    flushSave();
  }

  function updateSettings(nextEnabled: boolean): void {
    if (!nextEnabled) {
      moveTimersRef.current.forEach((t) => clearTimeout(t));
      moveTimersRef.current.clear();
      movedToBottomRef.current.clear();
      pendingNewItemsRef.current.clear();
      save({ ...content, sortCheckedToBottom: nextEnabled });
    } else {
      // Turning it on immediately parks every already-checked item at the
      // bottom, so the list matches the setting right away instead of only
      // catching up as items get toggled from here on.
      const unchecked = items.filter((item) => !item.checked);
      const checked = items.filter((item) => item.checked);
      checked.forEach((item) => item.id && movedToBottomRef.current.add(item.id));
      flipPrevRectsRef.current = captureRowRects();
      save({ ...content, sortCheckedToBottom: nextEnabled, items: [...unchecked, ...checked] });
    }
    flushSave();
  }

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
    const newItem: ChecklistItem = { id: randomId(), markdown: "", checked: false };
    // Starts at the bottom like any new item - `finishEditingNewItem` moves
    // it above the first checked item once the user is done editing it, so
    // it doesn't jump out from under them while they're still typing.
    if (sortCheckedToBottom) pendingNewItemsRef.current.add(newItem.id!);
    save({ ...content, items: [...items, newItem] });
    setPendingFocusIndex(items.length);
  }

  function removeItem(index: number) {
    const removedId = items[index]?.id;
    if (removedId) pendingNewItemsRef.current.delete(removedId);
    save({ ...content, items: items.filter((_, i) => i !== index) });
  }

  /** Same delete, plus the "Item deleted / Undo" toast - see undoSnapshot above. */
  function performSwipeDeleteItem(index: number): void {
    const item = items[index];
    if (!item) return;
    removeItem(index);
    flushSave();
    setUndoSnapshot({ index, item });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoSnapshot(null), 5000);
  }

  function undoSwipeDelete(): void {
    if (!undoSnapshot) return;
    const next = [...items];
    next.splice(undoSnapshot.index, 0, undoSnapshot.item);
    save({ ...content, items: next });
    setUndoSnapshot(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    // Matches the same `id ?? "unindexed-<n>"` fallback the rows are keyed
    // with below - a plain `item.id` lookup would miss for any item still
    // using that fallback (the brief window before the backfill effect
    // above assigns it a real one).
    const sortableIds = items.map((item, index) => item.id ?? `unindexed-${index}`);
    const activeIndex = sortableIds.indexOf(String(event.active.id));

    // Touch-only: the row itself is the drag source (see
    // ChecklistItemRow's canLongPressDrag), so the same long-press gesture
    // also has to resolve into "swipe left far enough -> delete" before
    // falling through to the reorder logic below - see BlockEditor.tsx's
    // handleDragEnd for the identical split at the block level. Unlike
    // there, a stationary long-press has nothing else to reveal (no id/link
    // button on an item), so it's left as the no-op it already was.
    if (event.activatorEvent.type === "touchstart") {
      const absX = Math.abs(event.delta.x);
      const absY = Math.abs(event.delta.y);
      if (absX < TAP_MOVEMENT_TOLERANCE_PX && absY < TAP_MOVEMENT_TOLERANCE_PX) return;
      if (absX > SWIPE_DELETE_THRESHOLD_PX && absX > absY) {
        if (activeIndex !== -1) performSwipeDeleteItem(activeIndex);
        return;
      }
    }

    if (!event.over || event.active.id === event.over.id) return;
    const newIndex = sortableIds.indexOf(String(event.over.id));
    if (activeIndex === -1 || newIndex === -1) return;
    // A manual drag overrides wherever auto-sort last parked this item -
    // see movedToBottomRef's own doc comment.
    movedToBottomRef.current.delete(String(event.active.id));
    save({ ...content, items: arrayMove(items, activeIndex, newIndex) });
    flushSave();
  }

  // Wraps the lock-exempt toggle path so the auto-sort logic above sees a
  // check/uncheck the instant it's clicked, rather than only after this
  // round-trips through the server and back (see toggleChecklistItemSchema
  // and BlockEditor.tsx's toggleChecklistItemMutation).
  const wrappedOnToggleItem = onToggleItem
    ? async (itemId: string, checked: boolean) => {
        handleCheckedChange(itemId, checked);
        await onToggleItem(itemId, checked);
      }
    : undefined;

  return (
    <div className="group/block space-y-1">
      <div className="flex items-center justify-end">
        {!readOnly && <ChecklistSettingsPopover enabled={sortCheckedToBottom} onChange={updateSettings} />}
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={dragSelectGuard.onDragStart}
        onDragCancel={dragSelectGuard.onDragCancel}
        onDragEnd={(event) => {
          dragSelectGuard.onDragEnd();
          handleDragEnd(event);
        }}
      >
        <SortableContext items={items.map((item, index) => item.id ?? `unindexed-${index}`)} strategy={verticalListSortingStrategy}>
          {/* `overflowAnchor: none` opts every row out of the browser's scroll-anchoring - without
              it, Chrome compensates the page's scroll position to keep whatever row is currently
              its anchor node visually still whenever the auto-sort reorder above moves items in the
              DOM, fighting with (and undoing) the FLIP animation's own "stay visually put" transform
              and making the whole page jump. The FLIP effect above already keeps rows visually
              stable, so scroll-anchoring's compensation is pure interference here. */}
          <div ref={listRef} style={{ overflowAnchor: "none" }}>
            {items.map((item, index) => (
              <ChecklistItemRow
                key={item.id ?? index}
                sortableId={item.id ?? `unindexed-${index}`}
                blockId={blockId}
                field={`items.${index}`}
                item={item}
                onToggle={(checked) => {
                  updateItem(index, { checked });
                  handleCheckedChange(item.id, checked);
                }}
                onToggleItem={wrappedOnToggleItem}
                onChangeText={(markdown) => updateItem(index, { markdown })}
                onEnter={addItem}
                onRemove={() => removeItem(index)}
                onFlush={() => {
                  flushSave();
                  finishEditingNewItem(item.id);
                }}
                readOnly={readOnly}
                registerInputRef={(el) => {
                  inputRefs.current[index] = el;
                  resizeTextarea(el);
                }}
                searchTerms={searchTerms}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        onClick={addItem}
        // Hidden (not just disabled) in read-only/locked content - see
        // globals.css's `[data-lock-hide]` rule. Unlike the per-item drag
        // handle/remove button above, this one isn't hover-revealed, so it
        // isn't already covered by that rule's `group-hover`/`opacity-100`
        // matching.
        data-lock-hide
        className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent"
      >
        <Icon name="plus" className="h-3 w-3" /> Add item
      </button>

      {undoSnapshot && <UndoToast message="Item deleted" onUndo={undoSwipeDelete} />}
    </div>
  );
}
