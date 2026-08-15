import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BlockType } from "@notorious/shared";
import { blockApi } from "../../lib/api/resources.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { ApiError } from "../../lib/api/client.js";
import { ContextMenu, useClampedPosition, type ContextMenuEntry } from "../ui/ContextMenu.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { buildFixedSlashCommandItems } from "./SlashCommand.js";
import { getTableEditor } from "./blocks/tableEditorRegistry.js";

/** True while the given block currently owns a non-collapsed browser text selection - Copy/Cut act on that selection (native `document.execCommand`, preserving exactly what's highlighted) instead of the whole block when one exists. Read once at mount: a right-click/long-press preserves whatever was already selected, and this menu's own presence doesn't itself change the selection. */
function hasSelectionWithin(blockId: string): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
  if (!blockEl) return false;
  return blockEl.contains(selection.getRangeAt(0).commonAncestorContainer);
}

/**
 * The universal block context menu - opened by a desktop right-click or a
 * touch long-press-then-release-without-moving alike (see BlockItem.tsx and
 * blockGestures.ts). Originally just a touch-only replacement for
 * BlockSlugButton's hover-revealed trigger and the row's own delete button
 * (both live in a gutter removed entirely on touch to reclaim content
 * width), it now also replaces the native browser context menu everywhere in
 * the editor with Copy/Cut/Duplicate/Turn into/Select all alongside those.
 */
export function BlockContextMenu({ blockId, slug, type, x, y }: { blockId: string; slug: string | null; type: BlockType; x: number; y: number }) {
  const { t } = useTranslation();
  const { objectId, deleteBlock, copyBlock, cutBlock, duplicateBlock, turnIntoBlock, selectAllInEditor, closeBlockMenu } = useBlockEditor();
  const [slugEditorOpen, setSlugEditorOpen] = useState(false);
  const [hasSelection] = useState(() => hasSelectionWithin(blockId));

  const items: ContextMenuEntry[] = [
    {
      key: "copy",
      label: t("editor.blockMenu.copy"),
      icon: "copy",
      onSelect: () => (hasSelection ? document.execCommand("copy") : copyBlock(blockId)),
    },
    {
      key: "cut",
      label: t("editor.blockMenu.cut"),
      icon: "cut",
      onSelect: () => (hasSelection ? document.execCommand("cut") : cutBlock(blockId)),
    },
    { key: "duplicate", label: t("editor.blockMenu.duplicate"), icon: "duplicate", onSelect: () => duplicateBlock(blockId) },
    {
      key: "turn-into",
      label: t("editor.blockMenu.turnInto"),
      icon: "turn-into",
      submenu: buildFixedSlashCommandItems()
        .filter((item) => item.type !== type)
        .map((item) => ({ key: item.type, label: item.label, onSelect: () => turnIntoBlock(blockId, item.type) })),
    },
    { key: "select-all", label: t("editor.blockMenu.selectAll"), icon: "select-all", onSelect: () => selectAllInEditor() },
    // Table-only: clears bold/italic/color/alignment on the current
    // selection inside the cell's own TipTap editor (see
    // tableEditorRegistry.ts) - a plain `document.execCommand` (used above
    // for Copy/Cut when there's a selection) mutates the DOM directly and
    // risks desyncing it from ProseMirror's document model, which every
    // other block-level command here avoids by going through TipTap/the
    // block editor's own mutations instead.
    ...(type === "table"
      ? [
          {
            key: "clear-formatting",
            label: t("editor.blockMenu.clearFormatting"),
            icon: "eraser",
            onSelect: () => getTableEditor(blockId)?.chain().focus().unsetAllMarks().setTextAlign("left").run(),
          },
        ]
      : []),
    { key: "sep-1", separator: true },
    { key: "set-slug", label: t("editor.blockMenu.setBlockId"), icon: "braces", onSelect: () => setSlugEditorOpen(true) },
    { key: "sep-2", separator: true },
    { key: "delete", label: t("editor.blockMenu.deleteBlock"), icon: "trash", danger: true, onSelect: () => deleteBlock(blockId) },
  ];

  if (slugEditorOpen) {
    return <BlockSlugEditor objectId={objectId} blockId={blockId} slug={slug} x={x} y={y} onDone={closeBlockMenu} />;
  }

  return <ContextMenu x={x} y={y} items={items} onClose={closeBlockMenu} />;
}

/** The "Set block id" sub-view of the menu above - kept as its own small stateful form (an input + save button) rather than a plain `ContextMenuItem`, since the generic menu only knows how to render a flat/nested action list. Positioned the same way (see useClampedPosition) so swapping between the two feels like one continuous panel. */
function BlockSlugEditor({
  objectId,
  blockId,
  slug,
  x,
  y,
  onDone,
}: {
  objectId: string;
  blockId: string;
  slug: string | null;
  x: number;
  y: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(containerRef, x, y);
  const queryClient = useQueryClient();
  useClickOutside(containerRef, onDone, true);

  const mutation = useMutation({
    mutationFn: () => blockApi.update(blockId, { slug: value || null }),
    onSuccess: () => {
      setError(null);
      onDone();
      void queryClient.invalidateQueries({ queryKey: ["blocks", objectId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : t("editor.blockMenu.saveIdFailed")),
  });

  return (
    <div
      ref={containerRef}
      className="fixed z-[100] w-56 rounded-lg border border-border bg-surface-raised p-2 shadow-lg"
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? "visible" : "hidden" }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{t("editor.blockMenu.blockId")}</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("editor.blockMenu.blockIdPlaceholder")}
        autoComplete="off"
        autoFocus
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
      />
      <p className="mt-1 text-[11px] text-ink-muted">{t("editor.blockMenu.reference", { value: value || "…" })}</p>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="mt-2 w-full rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {t("editor.blockMenu.saveId")}
      </button>
    </div>
  );
}
