import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { generateKeyBetween } from "fractional-indexing";
import type { Block, BlockType } from "@notorious/shared";
import { blockContentForFile, createEmptyTableDoc } from "@notorious/shared";
import { blockApi, fileApi, schemaApi } from "../../lib/api/resources.js";
import { buildBlockTree } from "./blockTree.js";
import { BlockEditorProvider } from "./BlockEditorContext.js";
import { BlockList } from "./BlockList.js";
import { useEditorHistory, type BlockSnapshot } from "./useEditorHistory.js";
import { useKeepFocusedElementVisible } from "../../hooks/useKeepFocusedElementVisible.js";
import { randomId } from "../../lib/randomId.js";
import { useDragSelectGuard } from "../../hooks/useDragSelectGuard.js";
import { SWIPE_DELETE_THRESHOLD_PX, TAP_MOVEMENT_TOLERANCE_PX } from "./blockGestures.js";
import { UndoToast } from "./UndoToast.js";
import { SearchMatchToolbar } from "./SearchMatchToolbar.js";
import { ActiveMatchHighlight } from "./ActiveMatchHighlight.js";
import { ancestorChain, findSearchMatches, flattenBlockTree, splitSearchTerms } from "../../lib/searchHighlight.js";

function isEditableElementFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  return el.isContentEditable;
}

/** Finds where `blockId` currently sits among its siblings, as a `{parentBlockId, afterBlockId}` pair - the shape `moveBlock`/`performMove` need to move it back there later. */
function currentEndpointsFor(all: Block[], blockId: string): { parentBlockId: string | null; afterBlockId: string | null } | null {
  const block = all.find((b) => b.id === blockId);
  if (!block) return null;
  const siblings = all
    .filter((b) => b.parentBlockId === block.parentBlockId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  const index = siblings.findIndex((b) => b.id === blockId);
  return { parentBlockId: block.parentBlockId, afterBlockId: index > 0 ? siblings[index - 1]!.id : null };
}

/**
 * Computes what the block list *should* look like immediately after a move,
 * for an optimistic cache update (see `moveMutation`'s `onMutate` below).
 * Without this, the block visibly snaps back to its old position for as
 * long as the move's round trip takes (a GET across the whole document,
 * which gets slower as the document grows) before jumping to its new spot
 * once the response lands - dnd-kit's own drag preview only exists *during*
 * the drag gesture, so the instant it ends, rendering falls back to
 * whatever `["blocks", objectId]` currently holds, which is still the old
 * order until this runs. Deriving the moved block's own position with the
 * exact same `generateKeyBetween` the server uses (not just re-rendering in
 * the right order some other way) means the eventual server-confirmed
 * refetch settles in without a second, correcting jump.
 */
function computeOptimisticMove(all: Block[], blockId: string, parentBlockId: string | null, afterBlockId: string | null): Block[] {
  const siblings = all
    .filter((b) => b.parentBlockId === parentBlockId && b.id !== blockId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  const afterIndex = afterBlockId ? siblings.findIndex((b) => b.id === afterBlockId) : -1;
  const afterBlock = afterIndex >= 0 ? siblings[afterIndex] : null;
  const beforeBlock = siblings[afterIndex + 1] ?? null;
  const position = generateKeyBetween(afterBlock?.position ?? null, beforeBlock?.position ?? null);
  return all.map((b) => (b.id === blockId ? { ...b, parentBlockId, position } : b));
}

interface BlockEditorProps {
  workspaceId: string;
  objectId: string;
  /** Which block's edit history shows in the Properties sidebar - lifted to ObjectDetailPage.tsx, which renders that sidebar outside this component's own tree. */
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
  /** Only passed by SubObjectBlock.tsx when nesting this editor for an "embed" display mode - see BlockEditorContext.tsx. Omitted at the top level, where this editor's own `objectId` is the start of the chain. */
  embedAncestorIds?: string[];
  /** Set by ObjectDetailPage.tsx when the object is locked (or read-only for this viewer) - see BlockEditorContext.tsx's `readOnly`. Always effectively true for an embedded instance too, regardless of this prop. */
  readOnly?: boolean;
  /** This object's template-rendered block text (see modules/templates/ on the server) - blockId -> field -> rendered text, only for fields whose raw source actually has `{{ }}`/`{% %}` syntax. See BlockEditorContext.tsx's `renderedBlocks` for how each templatable field uses this. */
  renderedBlocks?: Record<string, Record<string, string>> | null;
  /** True while the fetch behind `renderedBlocks` is still in flight - see BlockEditorContext.tsx's `renderedBlocksLoading`. */
  renderedBlocksLoading?: boolean;
  /** The active search query from a search-result click (see SearchPage.tsx's `?highlight=` param) - drives match scanning, scroll-to-match, and the floating SearchMatchToolbar below. `null`/omitted outside that flow. */
  highlightQuery?: string | null;
  /** Called when the user dismisses the search-match toolbar - ObjectDetailPage.tsx clears the `?highlight=` param. */
  onCloseHighlight?: () => void;
}

export function BlockEditor({
  workspaceId,
  objectId,
  selectedBlockId = null,
  onSelectBlock,
  embedAncestorIds,
  readOnly = false,
  renderedBlocks = null,
  renderedBlocksLoading = false,
  highlightQuery = null,
  onCloseHighlight,
}: BlockEditorProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const resolvedEmbedAncestorIds = embedAncestorIds ?? [objectId];
  // Only ever set by SubObjectBlock.tsx's own nested render (see its "embed"
  // display mode) - the top-level call from ObjectDetailPage.tsx never
  // passes this. Suppresses this instance's own toolbar/file-drop handling,
  // which wrapping it in read-only CSS alone doesn't reach (a drag-and-drop
  // file upload isn't a `button`/`input` the lock's pointer-events rules
  // cover, and hiding the toolbar buttons via `data-lock-hide` would still
  // leave the row itself sitting there empty). An embedded preview is also
  // always read-only, on top of that - see `readOnly` above.
  const isEmbedded = Boolean(embedAncestorIds);
  const effectiveReadOnly = readOnly || isEmbedded;
  // Split by input type instead of one PointerSensor: mouse keeps the
  // near-instant 4px-movement drag start, touch needs a short long-press
  // first (mirrors iOS/Android native reorder) so a plain tap-drag on the
  // handle doesn't get mistaken for the user trying to scroll the page.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const dragSelectGuard = useDragSelectGuard();
  // Touch-only long-press gesture state (see blockGestures.ts and
  // BlockItem.tsx) - contextMenuBlockId opens the menu that replaced the
  // per-block id/delete buttons removed on touch; showUndoToast follows a
  // swipe-delete specifically (the one new destructive gesture), not every
  // delete path - the toolbar delete button and backspace-on-empty already
  // have Ctrl+Z for that.
  const [contextMenuBlockId, setContextMenuBlockId] = useState<string | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const dragDepth = useRef(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  useKeepFocusedElementVisible(editorContainerRef);

  const { data: blocks } = useQuery({ queryKey: ["blocks", objectId], queryFn: () => blockApi.list(objectId) });
  // Memoized (not recomputed inline every render) so `matches` below, which
  // depends on it, doesn't get a new array identity - and therefore doesn't
  // re-trigger the scroll-to-match effect - on every unrelated re-render.
  const tree = useMemo(() => buildBlockTree(blocks ?? []), [blocks]);

  // Search-result navigation (see SearchPage.tsx's `?highlight=` param) -
  // only the top-level editor instance does any of this (an embedded
  // sub_object preview never receives `highlightQuery`, see isEmbedded
  // below), so it's harmless that this runs unconditionally.
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [forcedOpenBlockIds, setForcedOpenBlockIds] = useState<Set<string>>(new Set());
  const matches = useMemo(
    () => (highlightQuery ? findSearchMatches(flattenBlockTree(tree), highlightQuery, renderedBlocks) : []),
    [tree, highlightQuery, renderedBlocks],
  );
  useEffect(() => setActiveMatchIndex(0), [highlightQuery]);
  const clampedMatchIndex = matches.length > 0 ? Math.min(activeMatchIndex, matches.length - 1) : 0;
  const activeMatch = matches[clampedMatchIndex] ?? null;

  function forceOpenBlock(blockId: string): void {
    setForcedOpenBlockIds((prev) => (prev.has(blockId) ? prev : new Set(prev).add(blockId)));
  }

  // Reveals + scrolls to the active match: force-opens any collapsed toggle
  // ancestor (see ToggleBlock.tsx), then scrolls to the actual matched text
  // - not just the enclosing block - so a long block (a checklist with many
  // items, a paragraph with several lines) lands on the right line instead
  // of just the block's top edge. Which occurrence is "active" (the
  // brighter ring) is drawn separately, by ActiveMatchHighlight.tsx as an
  // independent overlay - see its own doc comment for why that isn't done
  // here as a DOM class toggle.
  useEffect(() => {
    if (!activeMatch) return;
    for (const ancestor of ancestorChain(blocks ?? [], activeMatch.blockId)) {
      if (ancestor.type === "toggle") forceOpenBlock(ancestor.id);
    }
    const { blockId, occurrenceIndexInBlock } = activeMatch;
    // A force-opened toggle's children (and a checklist's highlighted
    // preview, which only appears once its own effects settle) may not be
    // mounted on the very next frame - keep trying a few times rather than
    // silently scrolling to nothing if the first attempt finds no match yet.
    // Stops re-scrolling (which would otherwise interrupt its own smooth
    // animation) the moment it actually lands on the real matched text
    // rather than just the block's outer wrapper.
    let landedOnMatch = false;
    function scrollToMatch(): void {
      if (landedOnMatch) return;
      const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
      const mark = blockEl?.querySelectorAll(".search-match")[occurrenceIndexInBlock];
      (mark ?? blockEl)?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (mark) landedOnMatch = true;
    }
    const raf = requestAnimationFrame(scrollToMatch);
    const timers = [100, 250, 500].map((ms) => setTimeout(scrollToMatch, ms));
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch?.blockId, activeMatch?.occurrenceIndexInBlock, blocks]);

  // Same query key ObjectDetailPage.tsx and SubObjectBlock.tsx's picker
  // already use for this workspace's object types - shares their cache
  // instead of triggering its own fetch when either is mounted alongside
  // this editor. Feeds the add-block/slash menu's per-type entries (see
  // SlashCommand.ts) further down.
  const { data: objectTypes } = useQuery({ queryKey: ["objectTypes", workspaceId], queryFn: () => schemaApi.objectTypes(workspaceId) });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["blocks", objectId] });
    // A block's own template-rendered text, and potentially another block's
    // (an earlier `{% set %}`) or another object's referencing this one -
    // rendering is cheap to redo (see modules/templates/renderer.ts) so this
    // just refetches rather than trying to patch the cache in place.
    void queryClient.invalidateQueries({ queryKey: ["blocksRendered", objectId] });
    void queryClient.invalidateQueries({ queryKey: ["recentEdits", workspaceId] });
    // Prefix match, no specific block id: only one BlockHistoryPanel is ever
    // mounted at a time (see ObjectDetailPage.tsx's selectedBlockId), so
    // this just refreshes whichever one that happens to be - simpler than
    // threading "which block did this specific mutation touch" through
    // every call site here just to target it precisely.
    void queryClient.invalidateQueries({ queryKey: ["blockHistory"] });
  }

  // A sub_object block's presence drives the "sub_objects" relation
  // automatically now (see blocks/service.ts's `syncSubObjectRelation`) -
  // this just refreshes this tab's own view of that relation (the
  // SubObjectsPanel/BacklinksPanel below the editor, which both read from
  // `["object", objectId]`, not from the blocks list `invalidate()` above
  // already covers) right after it changes, instead of only on next
  // navigation.
  function invalidateHostObjectIfSubObject(blockType: BlockType | undefined): void {
    if (blockType !== "sub_object") return;
    void queryClient.invalidateQueries({ queryKey: ["object", objectId] });
  }

  const createMutation = useMutation({
    mutationFn: (input: { parentBlockId: string | null; afterBlockId: string | null; type: BlockType; content: Record<string, unknown> }) =>
      blockApi.create({ objectId, parentBlockId: input.parentBlockId, afterBlockId: input.afterBlockId, type: input.type, content: input.content }),
    onSuccess: (createdBlock) => {
      invalidate();
      setPendingFocusBlockId(createdBlock.id);
      history.recordCreate(createdBlock);
      invalidateHostObjectIfSubObject(createdBlock.type);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { blockId: string; content: Record<string, unknown> }) => blockApi.update(input.blockId, { content: input.content }),
    onSuccess: invalidate,
  });

  // Own mutation, not routed through `updateMutation` - checking off an item
  // hits a dedicated endpoint that's exempt from the object lock (see
  // toggleChecklistItemSchema), so it needs to stay a distinct call the
  // generic content-edit path never makes.
  const toggleChecklistItemMutation = useMutation({
    mutationFn: (input: { blockId: string; itemId: string; checked: boolean }) =>
      blockApi.toggleChecklistItem(input.blockId, { itemId: input.itemId, checked: input.checked }),
    onSuccess: invalidate,
  });

  // Own mutation, not routed through `updateMutation` - the client's
  // `sortCheckedToBottom` auto-sort reorder is a direct consequence of the
  // toggle above and needs the same lock exemption (see
  // reorderChecklistItemsSchema): the generic content-edit path isn't
  // exempt, and would leave a locked object's checkbox state persisted but
  // its reorder silently lost.
  const reorderChecklistItemsMutation = useMutation({
    mutationFn: (input: { blockId: string; itemIds: string[] }) => blockApi.reorderChecklistItems(input.blockId, { itemIds: input.itemIds }),
    onSuccess: invalidate,
  });

  // Own mutation, not routed through `updateMutation` - same reasoning as
  // `toggleChecklistItemMutation` above: this hits a dedicated endpoint
  // that's exempt from the object lock (owner-only), so it needs to stay a
  // distinct call the generic content-edit path never makes.
  const toggleWhiteboardPresentingMutation = useMutation({
    mutationFn: (input: { blockId: string; presenting: boolean }) =>
      blockApi.toggleWhiteboardPresenting(input.blockId, { presenting: input.presenting }),
    onSuccess: invalidate,
  });

  // Own mutation, not routed through `updateMutation` - same reasoning as
  // `toggleWhiteboardPresentingMutation` above: owner-only, exempt from the
  // object lock.
  const updateVotingSettingsMutation = useMutation({
    mutationFn: (input: { blockId: string; allowMultipleVotes: boolean; votingEndsAt: string | null }) =>
      blockApi.updateVotingSettings(input.blockId, { allowMultipleVotes: input.allowMultipleVotes, votingEndsAt: input.votingEndsAt }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (blockId: string) => blockApi.remove(blockId),
    onSuccess: invalidate,
  });

  const moveMutation = useMutation({
    mutationFn: (input: { blockId: string; parentBlockId: string | null; afterBlockId: string | null }) =>
      blockApi.move(input.blockId, { parentBlockId: input.parentBlockId, afterBlockId: input.afterBlockId }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["blocks", objectId] });
      const previous = queryClient.getQueryData<Block[]>(["blocks", objectId]);
      if (previous) {
        queryClient.setQueryData<Block[]>(
          ["blocks", objectId],
          computeOptimisticMove(previous, input.blockId, input.parentBlockId, input.afterBlockId),
        );
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["blocks", objectId], context.previous);
    },
    onSuccess: invalidate,
  });

  const restoreMutation = useMutation({
    mutationFn: (block: BlockSnapshot) => blockApi.restore({ objectId, ...block }),
    onSuccess: invalidate,
  });

  const history = useEditorHistory({
    onDelete: async (blockId) => {
      const snapshot = (blocks ?? []).find((b) => b.id === blockId) ?? null;
      await deleteMutation.mutateAsync(blockId);
      return snapshot;
    },
    onRestore: (block) => restoreMutation.mutateAsync(block),
    onMove: (blockId, parentBlockId, afterBlockId) => moveMutation.mutateAsync({ blockId, parentBlockId, afterBlockId }),
    // Not `performUpdate` below - undo/redo navigate the existing stack, they
    // shouldn't push a fresh entry back onto it every time they run.
    onUpdate: (blockId, content) => updateMutation.mutateAsync({ blockId, content }),
  });

  /** Looks up the block's current content before deleting it, so the delete is undoable. */
  function performDelete(blockId: string): void {
    const snapshot = (blocks ?? []).find((b) => b.id === blockId);
    deleteMutation.mutate(blockId, {
      onSuccess: () => {
        if (snapshot) history.recordDelete(snapshot);
        invalidateHostObjectIfSubObject(snapshot?.type);
      },
    });
  }

  /**
   * Same delete, plus a dismissible "Block deleted / Undo" toast - only for
   * the touch swipe-left gesture (see handleDragEnd below), since that's the
   * one delete path here with no confirmation step of its own. "Undo" just
   * calls the same history.undo() Ctrl+Z already uses, not a bespoke
   * by-block-id restore - the toast's short auto-dismiss window means the
   * swipe is virtually always still the top of the undo stack when it's
   * clicked.
   */
  function performSwipeDelete(blockId: string): void {
    performDelete(blockId);
    setShowUndoToast(true);
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    undoToastTimerRef.current = setTimeout(() => setShowUndoToast(false), 5000);
  }

  /**
   * Looks up the block's current (full, pre-merge) content before saving,
   * so a content edit is undoable too - one step per committed save, same
   * as create/delete/move, not one per keystroke (see useEditorHistory.ts).
   * Uses the server's response for the "after" snapshot rather than the raw
   * `content` argument, since a save is a partial, shallow-merged patch (see
   * blocks/service.ts's `updateBlock`) and undo needs the *full* content on
   * both sides to restore correctly.
   */
  function performUpdate(blockId: string, content: Record<string, unknown>): Promise<void> {
    // The definitive guard against a locked object or Preview mode ever
    // persisting a change, regardless of what triggered this call - a
    // read-only TipTap editor has still been observed to fire a spurious
    // `onUpdate` around an editable-state transition (see
    // useMarkdownEditor.ts's own `editableRef` guard, kept as defense in
    // depth) - this is the one choke point every block content save goes
    // through, so it's the most robust place to enforce "read-only never
    // saves" no matter which editor/mechanism tried to.
    if (effectiveReadOnly) return Promise.resolve();
    const before = (blocks ?? []).find((b) => b.id === blockId);
    return updateMutation
      .mutateAsync(
        { blockId, content },
        {
          onSuccess: (updated) => {
            if (before) history.recordUpdate(blockId, before.content, updated.content);
            invalidateHostObjectIfSubObject(before?.type);
          },
        },
      )
      .then(() => undefined);
  }

  /**
   * Captures where the block currently sits before moving it, so the move is
   * undoable. `precomputedFrom` lets a caller that already sorted the
   * sibling list for its own purposes (see `handleDragEnd`'s same-parent
   * branch) pass that along instead of making this recompute the identical
   * sort a second time.
   */
  function performMove(
    blockId: string,
    parentBlockId: string | null,
    afterBlockId: string | null,
    precomputedFrom?: { parentBlockId: string | null; afterBlockId: string | null } | null,
  ): void {
    const from = precomputedFrom !== undefined ? precomputedFrom : currentEndpointsFor(blocks ?? [], blockId);
    moveMutation.mutate(
      { blockId, parentBlockId, afterBlockId },
      {
        onSuccess: () => {
          if (from) history.recordMove(blockId, from, { parentBlockId, afterBlockId });
        },
      },
    );
  }

  // Ctrl+Z/Cmd+Z (undo) and Ctrl+Shift+Z/Cmd+Shift+Z or Ctrl+Y (redo) for
  // block structure changes - see useEditorHistory.ts for why content edits
  // aren't handled here. Skipped entirely while focus is inside a text
  // input/textarea/contenteditable, so it never competes with whatever
  // undo that surface already has of its own.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || isEditableElementFocused()) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        history.redo();
      } else if (key === "z") {
        event.preventDefault();
        history.undo();
      } else if (key === "y" && event.ctrlKey) {
        event.preventDefault();
        history.redo();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [history]);

  function defaultContentFor(type: BlockType): Record<string, unknown> {
    switch (type) {
      case "heading":
        return { markdown: "", level: 2 };
      case "checklist":
        return { items: [{ id: randomId(), markdown: "", checked: false }] };
      case "table":
        return { doc: createEmptyTableDoc() };
      case "code":
        return { code: "", language: "text" };
      case "callout":
        return { markdown: "", icon: "💡" };
      case "columns":
        return { columnCount: 2 };
      case "toggle":
        return { summaryMarkdown: "" };
      case "secret":
        return { text: "" };
      case "sub_object":
        return { objectId: null };
      case "bookmark":
        return { url: "" };
      case "pdf":
      case "audio":
        return { url: "", filename: "", size: 0, fileId: "" };
      case "file":
        return { url: "", filename: "", size: 0, mimeType: "", fileId: "" };
      case "whiteboard":
        return {};
      case "calendar":
        return { objectTypeConfigs: [] };
      case "voting":
        return { items: [], allowMultipleVotes: true, votingEndsAt: null };
      case "ai":
        return { prompt: "" };
      case "maps":
        return { query: "" };
      case "rssFeed":
        return { maxItemsShown: 10 };
      default:
        return {};
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setIsDraggingAny(true);
    dragSelectGuard.onDragStart();
    // Confirms the long-press activated (see blockGestures.ts) - the one
    // moment worth a haptic nudge, since the block row otherwise gives no
    // other feedback that it just became draggable (no visible handle on
    // touch, see BlockItem.tsx). Silently a no-op on browsers/devices
    // without vibration support.
    if (event.activatorEvent.type === "touchstart") navigator.vibrate?.(15);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDraggingAny(false);
    dragSelectGuard.onDragEnd();
    const blockId = String(event.active.id);

    // Touch-only: the row itself is now the drag source (see BlockItem.tsx),
    // not just a small handle, so the same long-press gesture has to double
    // as "open the block's menu" (no movement) and "delete" (swiped left far
    // enough) before falling through to the desktop reorder logic below,
    // which only ever runs from the dedicated grip handle and has no such
    // ambiguity to resolve.
    if (event.activatorEvent.type === "touchstart") {
      const absX = Math.abs(event.delta.x);
      const absY = Math.abs(event.delta.y);
      if (absX < TAP_MOVEMENT_TOLERANCE_PX && absY < TAP_MOVEMENT_TOLERANCE_PX) {
        setContextMenuBlockId(blockId);
        return;
      }
      if (absX > SWIPE_DELETE_THRESHOLD_PX && absX > absY) {
        performSwipeDelete(blockId);
        return;
      }
    }

    if (!event.over || event.active.id === event.over.id) return;
    const overId = String(event.over.id);
    const all = blocks ?? [];
    const draggedBlock = all.find((b) => b.id === blockId);
    const overBlock = all.find((b) => b.id === overId);
    if (!draggedBlock || !overBlock) return;

    if (draggedBlock.parentBlockId !== overBlock.parentBlockId) {
      // Moving into a different nesting level entirely (e.g. into another
      // toggle/column) - there's no "old position" within that list to
      // compare against, so just drop it right after whatever it landed on.
      performMove(blockId, overBlock.parentBlockId, overBlock.id);
      return;
    }

    // Same level: `over.id` is just "which slot the pointer is over now", not
    // "insert after this" - always inserting after it silently reversed any
    // drag that moved a block *upward* past its target, since the block would
    // still end up below the thing it was dropped on. Reordering the sibling
    // list the same way dnd-kit's own list does (`arrayMove`) and reading off
    // the block's new predecessor gives the correct side regardless of
    // drag direction.
    // Plain ordinal comparison, not `localeCompare` - see blockTree.ts for why
    // locale-aware collation scrambles these fractional-indexing position keys.
    const siblings = all
      .filter((b) => b.parentBlockId === draggedBlock.parentBlockId)
      .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
    const oldIndex = siblings.findIndex((b) => b.id === blockId);
    const newIndex = siblings.findIndex((b) => b.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    // Already have the sorted sibling list right here - the "from" endpoint
    // undo needs is just this block's predecessor in it, no need to make
    // performMove re-sort the same array again to re-derive it.
    const fromAfterBlockId = oldIndex > 0 ? siblings[oldIndex - 1]!.id : null;
    const reordered = arrayMove(siblings, oldIndex, newIndex);
    const draggedIndex = reordered.findIndex((b) => b.id === blockId);
    const afterBlockId = draggedIndex > 0 ? reordered[draggedIndex - 1]!.id : null;
    performMove(blockId, overBlock.parentBlockId, afterBlockId, { parentBlockId: draggedBlock.parentBlockId, afterBlockId: fromAfterBlockId });
  }

  /** Uploads each dropped file and appends a block for it (image/video get a
   * matching block type, PDFs/audio embed, everything else becomes a link). */
  async function handleFilesDropped(files: File[]) {
    setIsUploadingFiles(true);
    try {
      let afterBlockId = tree[tree.length - 1]?.id ?? null;
      for (const file of files) {
        const asset = await fileApi.upload(workspaceId, file, objectId);
        const { type, content } = blockContentForFile(file.type, file.name, fileApi.downloadUrl(asset.id), asset.id, asset.size);
        const created = await createMutation.mutateAsync({ parentBlockId: null, afterBlockId, type, content });
        afterBlockId = created.id;
      }
    } finally {
      setIsUploadingFiles(false);
    }
  }

  function handleDragEnter(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragOver(true);
  }

  function handleDragLeave(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  }

  function handleDrop(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) void handleFilesDropped(files);
  }

  return (
    <BlockEditorProvider
      value={{
        workspaceId,
        objectId,
        objectTypes: objectTypes ?? [],
        embedAncestorIds: resolvedEmbedAncestorIds,
        readOnly: effectiveReadOnly,
        renderedBlocks,
        renderedBlocksLoading,
        createBlockAfter: (parentBlockId, afterBlockId, type, extraContent) =>
          createMutation.mutate({ parentBlockId, afterBlockId, type, content: { ...defaultContentFor(type), ...extraContent } }),
        updateBlockContent: (blockId, content) => performUpdate(blockId, content),
        toggleChecklistItem: (blockId, itemId, checked) =>
          toggleChecklistItemMutation.mutateAsync({ blockId, itemId, checked }).then(() => undefined),
        reorderChecklistItems: (blockId, itemIds) =>
          reorderChecklistItemsMutation.mutateAsync({ blockId, itemIds }).then(() => undefined),
        toggleWhiteboardPresenting: (blockId, presenting) =>
          toggleWhiteboardPresentingMutation.mutateAsync({ blockId, presenting }).then(() => undefined),
        updateVotingSettings: (blockId, allowMultipleVotes, votingEndsAt) =>
          updateVotingSettingsMutation.mutateAsync({ blockId, allowMultipleVotes, votingEndsAt }).then(() => undefined),
        deleteBlock: (blockId) => performDelete(blockId),
        moveBlock: (blockId, parentBlockId, afterBlockId) => performMove(blockId, parentBlockId, afterBlockId),
        pendingFocusBlockId,
        clearPendingFocus: () => setPendingFocusBlockId(null),
        isDraggingAny,
        onTouchArmStart: dragSelectGuard.onTouchArmStart,
        selectedBlockId,
        selectBlock: (blockId) => onSelectBlock?.(blockId),
        contextMenuBlockId,
        closeBlockMenu: () => setContextMenuBlockId(null),
        searchHighlight: activeMatch
          ? { terms: splitSearchTerms(highlightQuery ?? ""), activeBlockId: activeMatch.blockId }
          : null,
        forcedOpenBlockIds,
        forceOpenBlock,
      }}
    >
      <div
        ref={editorContainerRef}
        className="relative"
        onDragEnter={isEmbedded ? undefined : handleDragEnter}
        onDragOver={
          isEmbedded
            ? undefined
            : (event) => {
                if (event.dataTransfer.types.includes("Files")) event.preventDefault();
              }
        }
        onDragLeave={isEmbedded ? undefined : handleDragLeave}
        onDrop={isEmbedded ? undefined : handleDrop}
      >
        {(isDragOver || isUploadingFiles) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/5">
            <p className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-accent shadow-lg">
              {isUploadingFiles ? t("editor.dropzone.uploading") : t("editor.dropzone.dropToAttach")}
            </p>
          </div>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setIsDraggingAny(false);
            dragSelectGuard.onDragCancel();
          }}
        >
          <div className="group/editor">
            <BlockList blocks={tree} parentBlockId={null} />
          </div>
        </DndContext>
      </div>

      {showUndoToast && (
        <UndoToast
          message={t("editor.undoToast.blockDeleted")}
          onUndo={() => {
            history.undo();
            setShowUndoToast(false);
          }}
        />
      )}

      {!isEmbedded && highlightQuery && matches.length > 0 && (
        <>
          <ActiveMatchHighlight
            blockId={activeMatch?.blockId ?? null}
            occurrenceIndex={activeMatch?.occurrenceIndexInBlock ?? null}
          />
          <SearchMatchToolbar
            current={clampedMatchIndex + 1}
            total={matches.length}
            onPrev={() => setActiveMatchIndex((i) => (i - 1 + matches.length) % matches.length)}
            onNext={() => setActiveMatchIndex((i) => (i + 1) % matches.length)}
            onClose={() => onCloseHighlight?.()}
          />
        </>
      )}
    </BlockEditorProvider>
  );
}
