import { useRef, useState, type PointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { VotingContent, VotingItem, VoteSummary } from "@notorious/shared";
import { useAuth } from "../../../context/AuthContext.js";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { useDragSelectGuard } from "../../../hooks/useDragSelectGuard.js";
import { useClickOutside } from "../../../hooks/useClickOutside.js";
import { useKeepInViewport } from "../../../hooks/useKeepInViewport.js";
import { useHasHover } from "../../../hooks/useHasHover.js";
import { useTwoFingerTap } from "../../../hooks/useTwoFingerTap.js";
import { blockApi, workspaceApi } from "../../../lib/api/resources.js";
import { getVisitorId } from "../../../lib/visitorIdentity.js";
import { randomId } from "../../../lib/randomId.js";
import { resizeTextarea } from "../../../lib/resizeTextarea.js";
import { wasLastPointerTouch } from "../../../lib/pointerTracking.js";
import { Icon } from "../../ui/Icon.js";
import { ContextMenu, isNativeMenuOverride } from "../../ui/ContextMenu.js";
import { useBlockEditor } from "../BlockEditorContext.js";
import { HighlightedText } from "../HighlightedText.js";
import { SWIPE_DELETE_THRESHOLD_PX, TAP_MOVEMENT_TOLERANCE_PX } from "../blockGestures.js";
import { UndoToast } from "../UndoToast.js";

const EMPTY_SUMMARY: VoteSummary = { up: 0, down: 0, myVote: null };

/** Local <-> UTC round-trip for a `datetime-local` input, same helper as PropertyField.tsx's own `toLocalInputValue`. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function VotingSettingsPopover({
  allowMultipleVotes,
  votingEndsAt,
  onSave,
}: {
  allowMultipleVotes: boolean;
  votingEndsAt: string | null;
  onSave: (allowMultipleVotes: boolean, votingEndsAt: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
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
        title={t("editor.blocks.voting.settingsTitle")}
        // Exempt from the object-lock (owner-only) - see
        // updateVotingSettingsSchema and ObjectDetailPage.tsx's
        // READ_ONLY_LOCK_ALLOW_CHECKLIST.
        data-lock-exempt
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
          {/* `data-lock-exempt` on every field in here too - these all go
              through the same owner-only, lock-exempt settings endpoint as
              the gear button above (see updateVotingSettingsSchema), and
              without it ObjectDetailPage.tsx's READ_ONLY_LOCK_ALLOW_CHECKLIST
              would otherwise still block them via its `input:not([data-lock-exempt])`
              rule even though the gear itself is reachable. */}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-lock-exempt
              className="accent-accent"
              checked={allowMultipleVotes}
              onChange={(e) => void onSave(e.target.checked, votingEndsAt)}
            />
            {t("editor.blocks.voting.allowMultiple")}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-lock-exempt
              className="accent-accent"
              checked={votingEndsAt !== null}
              onChange={(e) => void onSave(allowMultipleVotes, e.target.checked ? new Date(Date.now() + 86_400_000).toISOString() : null)}
            />
            {t("editor.blocks.voting.votingDeadline")}
          </label>
          {votingEndsAt !== null && (
            <input
              type="datetime-local"
              data-lock-exempt
              value={toLocalInputValue(votingEndsAt)}
              onChange={(e) => e.target.value && void onSave(allowMultipleVotes, new Date(e.target.value).toISOString())}
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
            />
          )}
        </div>
      )}
    </div>
  );
}

function VotingItemRow({
  sortableId,
  item,
  summary,
  votingClosed,
  readOnly,
  searchTerms,
  onVote,
  onChangeTitle,
  onChangeDescription,
  onRemove,
  onDuplicate,
  onTouchArmStart,
}: {
  sortableId: string;
  item: VotingItem;
  summary: VoteSummary;
  votingClosed: boolean;
  readOnly: boolean;
  /** See BlockEditorContext.tsx's `searchHighlight` - option title/description aren't TipTap instances, so they can't use SearchHighlight.ts's decorations (see HighlightedText.tsx). */
  searchTerms: string[];
  onVote: (direction: "up" | "down") => void;
  onChangeTitle: (title: string) => void;
  onChangeDescription: (description: string) => void;
  onRemove: () => void;
  /** Right-click / two-finger-tap item-level context menu - see ChecklistBlock.tsx's identical pattern. */
  onDuplicate: () => void;
  /** Bind as `onPointerDownCapture` on whatever carries `listeners` below - see useDragSelectGuard.ts. */
  onTouchArmStart: (event: PointerEvent) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
  // Same touch-vs-hover split as BlockItem.tsx/ChecklistBlock.tsx.
  const hasHover = useHasHover();
  const [isEditingContent, setIsEditingContent] = useState(false);
  // Shows a highlighted plain-text preview instead of the textarea/input
  // whenever there are active search terms, until the user clicks in to
  // actually edit that field - same idea as ChecklistBlock.tsx's
  // `searchPreviewOverridden`, split per-field since an option has two
  // independently editable strings.
  const [titlePreviewOverridden, setTitlePreviewOverridden] = useState(false);
  const [descriptionPreviewOverridden, setDescriptionPreviewOverridden] = useState(false);
  const showTitlePreview = searchTerms.length > 0 && !titlePreviewOverridden;
  const showDescriptionPreview = searchTerms.length > 0 && !descriptionPreviewOverridden;
  const canLongPressDrag = !hasHover && !readOnly && !isEditingContent;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && hasHover ? 0.5 : 1,
    boxShadow: isDragging && !hasHover ? "0 8px 24px rgb(0 0 0 / 0.25)" : undefined,
    WebkitTouchCallout: !hasHover ? ("none" as const) : undefined,
  };
  const deleteRevealProgress =
    isDragging && !hasHover && transform && transform.x < 0 ? Math.min(1, -transform.x / SWIPE_DELETE_THRESHOLD_PX) : 0;
  const total = summary.up + summary.down;
  const upRatio = total > 0 ? Math.round((summary.up / total) * 100) : 0;
  const score = summary.up - summary.down;
  // Item-level context menu - see ChecklistBlock.tsx's ChecklistItemRow for
  // the identical pattern this mirrors (right-click/two-finger-tap on the
  // option stops it reaching the block-level menu, unless read-only).
  const [itemMenu, setItemMenu] = useState<{ x: number; y: number } | null>(null);
  const itemTwoFingerTap = useTwoFingerTap((x, y) => {
    if (!readOnly) setItemMenu({ x, y });
  });
  function handleItemTouchStart(event: ReactTouchEvent): void {
    if (canLongPressDrag) listeners?.onTouchStart?.(event);
    if (!readOnly) event.stopPropagation();
    itemTwoFingerTap.onTouchStart(event);
  }

  return (
    <div className="relative">
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
        onTouchStart={handleItemTouchStart}
        onTouchMove={itemTwoFingerTap.onTouchMove}
        onTouchEnd={itemTwoFingerTap.onTouchEnd}
        onTouchCancel={itemTwoFingerTap.onTouchCancel}
        onPointerDownCapture={canLongPressDrag ? onTouchArmStart : undefined}
        onContextMenu={(event) => {
          if (readOnly || isNativeMenuOverride(event)) return;
          if (wasLastPointerTouch()) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          setItemMenu({ x: event.clientX, y: event.clientY });
        }}
        className={`group/votingitem relative flex items-start gap-2 ${!hasHover ? "bg-surface" : ""} ${
          isDragging && !hasHover ? "z-10 scale-[1.02]" : ""
        }`}
      >
        {hasHover && (
          <button
            {...attributes}
            {...listeners}
            onPointerDownCapture={onTouchArmStart}
            // Hidden while locked/read-only, same as ChecklistBlock's drag handle -
            // reordering items is content editing, unlike the vote arrows next to it.
            className="mt-1.5 shrink-0 cursor-grab rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-ink group-hover/votingitem:opacity-100 disabled:opacity-0"
            style={{ visibility: readOnly ? "hidden" : "visible" }}
            title={t("editor.blocks.voting.dragToReorder")}
          >
            <Icon name="grip-vertical" className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Vote arrows - deliberately never gated by `readOnly`: voting stays
            available on a locked object / for viewer-only share visitors, only
            a passed deadline (`votingClosed`) disables them. */}
        <div className="flex w-9 shrink-0 flex-col items-center pt-0.5">
          <button
            type="button"
            // Stays clickable even when the object is locked or this is a
            // read-only share visitor - see ObjectDetailPage.tsx's
            // READ_ONLY_LOCK/READ_ONLY_LOCK_ALLOW_CHECKLIST and castVoteSchema.
            data-vote-exempt
            disabled={votingClosed}
            onClick={() => onVote("up")}
            title={t("editor.blocks.voting.upvote")}
            className={`rounded p-0.5 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 ${
              summary.myVote === "up" ? "text-accent" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon name="chevron-up" className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium tabular-nums text-ink">{score}</span>
          <button
            type="button"
            data-vote-exempt
            disabled={votingClosed}
            onClick={() => onVote("down")}
            title={t("editor.blocks.voting.downvote")}
            className={`rounded p-0.5 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 ${
              summary.myVote === "down" ? "text-red-500" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icon name="chevron-down" className="h-4 w-4" />
          </button>
          {total > 0 && (
            <div className="mt-1 h-1 w-8 overflow-hidden rounded-full bg-red-500/30" title={`${upRatio}% upvoted`}>
              <div className="h-full bg-accent" style={{ width: `${upRatio}%` }} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-0.5 py-0.5">
          {showTitlePreview ? (
            <div
              onClick={() => !readOnly && setTitlePreviewOverridden(true)}
              className={`w-full text-sm font-medium ${readOnly ? "" : "cursor-text"}`}
            >
              <HighlightedText text={item.title || t("editor.blocks.voting.optionPlaceholder")} terms={searchTerms} />
            </div>
          ) : (
            <textarea
              ref={(el) => resizeTextarea(el)}
              value={item.title}
              onChange={(e) => {
                onChangeTitle(e.target.value);
                resizeTextarea(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              onBlur={() => setTitlePreviewOverridden(false)}
              autoFocus={titlePreviewOverridden}
              readOnly={readOnly}
              placeholder={t("editor.blocks.voting.optionPlaceholder")}
              autoComplete="off"
              rows={1}
              className="w-full resize-none overflow-hidden border-none bg-transparent text-sm font-medium outline-none"
            />
          )}
          {(item.description || !readOnly) &&
            (showDescriptionPreview ? (
              <div
                onClick={() => !readOnly && setDescriptionPreviewOverridden(true)}
                className={`w-full text-xs text-ink-muted ${readOnly ? "" : "cursor-text"}`}
              >
                <HighlightedText text={item.description || t("editor.blocks.voting.descriptionPlaceholder")} terms={searchTerms} />
              </div>
            ) : (
              <input
                value={item.description ?? ""}
                onChange={(e) => onChangeDescription(e.target.value)}
                onBlur={() => setDescriptionPreviewOverridden(false)}
                autoFocus={descriptionPreviewOverridden}
                readOnly={readOnly}
                placeholder={t("editor.blocks.voting.descriptionPlaceholder")}
                autoComplete="off"
                className="w-full border-none bg-transparent text-xs text-ink-muted outline-none"
              />
            ))}
        </div>

        {hasHover && (
          <button
            onClick={onRemove}
            style={{ visibility: readOnly ? "hidden" : "visible" }}
            className="mt-1 shrink-0 rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-red-500 group-hover/votingitem:opacity-100"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {itemMenu && (
        <ContextMenu
          x={itemMenu.x}
          y={itemMenu.y}
          items={[{ key: "duplicate", label: t("editor.blockMenu.duplicate"), icon: "duplicate", onSelect: onDuplicate }]}
          onClose={() => setItemMenu(null)}
        />
      )}
    </div>
  );
}

export function VotingBlock({
  blockId,
  content: externalContent,
  onSave,
  onUpdateSettings,
}: {
  blockId: string;
  content: VotingContent;
  onSave: (c: VotingContent) => Promise<void>;
  /** Owner-only, exempt from the object lock - see updateVotingSettingsSchema. */
  onUpdateSettings: (allowMultipleVotes: boolean, votingEndsAt: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { readOnly, workspaceId, searchHighlight } = useBlockEditor();
  const searchTerms = searchHighlight?.terms ?? [];
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, save] = useDebouncedSave(externalContent, onSave);
  const items = content.items ?? [];
  const allowMultipleVotes = content.allowMultipleVotes !== false;
  const votingEndsAt = content.votingEndsAt ?? null;
  const votingClosed = votingEndsAt !== null && new Date(votingEndsAt).getTime() <= Date.now();
  // Split by input type - see ChecklistBlock.tsx's identical sensors for why.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  const dragSelectGuard = useDragSelectGuard();
  // Touch-only swipe-delete undo - see ChecklistBlock.tsx's identical pair.
  const [undoSnapshot, setUndoSnapshot] = useState<{ index: number; item: VotingItem } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only a real workspace owner can reach `onUpdateSettings` server-side (see
  // updateVotingSettingsSchema's minRole) - hiding the gear for everyone else
  // avoids a control that would just 403 if clicked.
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId) });
  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);

  const { data: votes } = useQuery({
    queryKey: ["blockVotes", blockId],
    queryFn: () => blockApi.getVotes(blockId, user ? undefined : getVisitorId()),
  });

  const castVoteMutation = useMutation({
    mutationFn: (input: { itemId: string; value: "up" | "down" | null }) =>
      blockApi.castVote(blockId, { itemId: input.itemId, value: input.value, voterKey: user ? undefined : getVisitorId() }),
    onSuccess: (summary) => queryClient.setQueryData(["blockVotes", blockId], summary),
  });

  function handleVote(itemId: string, direction: "up" | "down") {
    if (votingClosed) return;
    const current = votes?.[itemId]?.myVote ?? null;
    castVoteMutation.mutate({ itemId, value: current === direction ? null : direction });
  }

  function updateItem(index: number, patch: Partial<VotingItem>) {
    save({ ...content, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  }

  function addItem() {
    save({ ...content, items: [...items, { id: randomId(), title: "", description: "" }] });
  }

  function removeItem(index: number) {
    save({ ...content, items: items.filter((_, i) => i !== index) });
  }

  /** Item-level "Duplicate" (see VotingItemRow's context menu) - inserts an exact copy (new id, same title/description) directly after the original, mirroring ChecklistBlock.tsx's identical `duplicateItem`. */
  function duplicateItem(index: number) {
    const original = items[index];
    if (!original) return;
    const copy: VotingItem = { ...original, id: randomId() };
    save({ ...content, items: [...items.slice(0, index + 1), copy, ...items.slice(index + 1)] });
  }

  /** Same delete, plus the "Item deleted / Undo" toast - see undoSnapshot above. */
  function performSwipeDeleteItem(index: number): void {
    const item = items[index];
    if (!item) return;
    removeItem(index);
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
    const ids = items.map((item) => item.id);
    const activeIndex = ids.indexOf(String(event.active.id));

    // Touch-only swipe-to-delete/tap-context split - see
    // ChecklistBlock.tsx's identical handleDragEnd for the full reasoning.
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
    const newIndex = ids.indexOf(String(event.over.id));
    if (activeIndex === -1 || newIndex === -1) return;
    save({ ...content, items: arrayMove(items, activeIndex, newIndex) });
  }

  return (
    <div className="group/block space-y-1">
      <div className="flex items-center justify-end">
        {votingClosed && <span className="mr-auto text-xs text-ink-muted">{t("editor.blocks.voting.votingClosed")}</span>}
        {isOwner && (
          <VotingSettingsPopover
            allowMultipleVotes={allowMultipleVotes}
            votingEndsAt={votingEndsAt}
            onSave={onUpdateSettings}
          />
        )}
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
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {items.map((item, index) => (
            <VotingItemRow
              key={item.id}
              sortableId={item.id}
              item={item}
              summary={votes?.[item.id] ?? EMPTY_SUMMARY}
              votingClosed={votingClosed}
              readOnly={readOnly}
              searchTerms={searchTerms}
              onVote={(direction) => handleVote(item.id, direction)}
              onChangeTitle={(title) => updateItem(index, { title })}
              onChangeDescription={(description) => updateItem(index, { description })}
              onRemove={() => removeItem(index)}
              onDuplicate={() => duplicateItem(index)}
              onTouchArmStart={dragSelectGuard.onTouchArmStart}
            />
          ))}
        </SortableContext>
      </DndContext>
      {!readOnly && (
        <button onClick={addItem} data-lock-hide className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent">
          <Icon name="plus" className="h-3 w-3" /> {t("editor.blocks.voting.addOption")}
        </button>
      )}

      {undoSnapshot && <UndoToast message={t("editor.blocks.voting.itemDeleted")} onUndo={undoSwipeDelete} />}
    </div>
  );
}
