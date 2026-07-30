import { useEffect, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { generateKeyBetween } from "fractional-indexing";
import type { Block, BlockType } from "@notorious/shared";
import { blockApi, fileApi } from "../../lib/api/resources.js";
import { withShareToken } from "../../lib/api/shareMode.js";
import { buildBlockTree } from "./blockTree.js";
import { BlockEditorProvider } from "./BlockEditorContext.js";
import { BlockList } from "./BlockList.js";
import { useEditorHistory, type BlockSnapshot } from "./useEditorHistory.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";

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

/** Picks a sensible block type/content for a dropped file, based on its MIME type. */
function blockForDroppedFile(file: File, url: string, fileId: string): { type: BlockType; content: Record<string, unknown> } {
  if (file.type.startsWith("image/")) return { type: "image", content: { url, caption: file.name, fileId } };
  if (file.type.startsWith("video/")) return { type: "video", content: { url, caption: file.name, fileId } };
  if (file.type.startsWith("audio/") || file.type === "application/pdf") return { type: "embed", content: { url } };
  return { type: "paragraph", content: { markdown: `[${file.name}](${url})` } };
}

export function BlockEditor({ workspaceId, objectId }: { workspaceId: string; objectId: string }) {
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [pendingFocusBlockId, setPendingFocusBlockId] = useState<string | null>(null);
  const [isDraggingAny, setIsDraggingAny] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const dragDepth = useRef(0);

  const { data: blocks } = useQuery({ queryKey: ["blocks", objectId], queryFn: () => blockApi.list(objectId) });
  const tree = buildBlockTree(blocks ?? []);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["blocks", objectId] });
    void queryClient.invalidateQueries({ queryKey: ["recentEdits", workspaceId] });
  }

  const createMutation = useMutation({
    mutationFn: (input: { parentBlockId: string | null; afterBlockId: string | null; type: BlockType; content: Record<string, unknown> }) =>
      blockApi.create({ objectId, parentBlockId: input.parentBlockId, afterBlockId: input.afterBlockId, type: input.type, content: input.content }),
    onSuccess: (createdBlock) => {
      invalidate();
      setPendingFocusBlockId(createdBlock.id);
      history.recordCreate(createdBlock);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { blockId: string; content: Record<string, unknown> }) => blockApi.update(input.blockId, { content: input.content }),
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

  const importMutation = useMutation({
    mutationFn: (markdown: string) => blockApi.importMarkdown(objectId, markdown),
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
      },
    });
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
    const before = (blocks ?? []).find((b) => b.id === blockId);
    return updateMutation
      .mutateAsync(
        { blockId, content },
        {
          onSuccess: (updated) => {
            if (before) history.recordUpdate(blockId, before.content, updated.content);
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
        return { items: [] };
      case "table":
        return { columns: ["Column 1", "Column 2"], rows: [["", ""]] };
      case "code":
        return { code: "", language: "text" };
      case "callout":
        return { markdown: "", icon: "💡" };
      case "columns":
        return { columnCount: 2 };
      case "toggle":
        return { summaryMarkdown: "" };
      case "sub_object":
        return { objectId: null };
      case "bookmark":
        return { url: "" };
      case "whiteboard":
        return {};
      default:
        return {};
    }
  }

  function handleDragStart(_event: DragStartEvent) {
    setIsDraggingAny(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDraggingAny(false);
    if (!event.over || event.active.id === event.over.id) return;
    const blockId = String(event.active.id);
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
        const { type, content } = blockForDroppedFile(file, fileApi.downloadUrl(asset.id), asset.id);
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
        createBlockAfter: (parentBlockId, afterBlockId, type, extraContent) =>
          createMutation.mutate({ parentBlockId, afterBlockId, type, content: { ...defaultContentFor(type), ...extraContent } }),
        updateBlockContent: (blockId, content) => performUpdate(blockId, content),
        deleteBlock: (blockId) => performDelete(blockId),
        moveBlock: (blockId, parentBlockId, afterBlockId) => performMove(blockId, parentBlockId, afterBlockId),
        pendingFocusBlockId,
        clearPendingFocus: () => setPendingFocusBlockId(null),
        isDraggingAny,
      }}
    >
      <div
        className="relative"
        onDragEnter={handleDragEnter}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {(isDragOver || isUploadingFiles) && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/5">
            <p className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-accent shadow-lg">
              {isUploadingFiles ? "Uploading…" : "Drop files to attach them"}
            </p>
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => window.open(withShareToken(blockApi.exportMarkdownUrl(objectId)), "_blank")}>
            <Icon name="download" className="h-3.5 w-3.5" /> Export Markdown
          </Button>
          <Button variant="ghost" onClick={() => importInputRef.current?.click()}>
            <Icon name="upload" className="h-3.5 w-3.5" /> Import Markdown
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".md,text/markdown"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              importMutation.mutate(await file.text());
            }}
          />
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setIsDraggingAny(false)}>
          <div className="group/editor">
            <BlockList blocks={tree} parentBlockId={null} />
          </div>
        </DndContext>
      </div>
    </BlockEditorProvider>
  );
}
