import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BlockType } from "@notorious/shared";
import { blockApi, chatApi, objectApi, workspaceApi } from "../../lib/api/resources.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { useAuth } from "../../context/AuthContext.js";
import { useChatOverlay } from "../../context/ChatOverlayContext.js";
import { ApiError } from "../../lib/api/client.js";
import { ContextMenu, useClampedPosition, type ContextMenuEntry } from "../ui/ContextMenu.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { buildFixedSlashCommandItems } from "./SlashCommand.js";
import { getBlockEditor } from "./editorRegistry.js";

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
  const { workspaceId, objectId, readOnly, deleteBlock, copyBlock, cutBlock, duplicateBlock, turnIntoBlock, selectAllInEditor, closeBlockMenu } =
    useBlockEditor();
  const [slugEditorOpen, setSlugEditorOpen] = useState(false);
  const [hasSelection] = useState(() => hasSelectionWithin(blockId));
  const richTextEditor = getBlockEditor(blockId);
  const { user: currentUser } = useAuth();
  const chatOverlay = useChatOverlay();
  // Cheap: ObjectDetailPage.tsx already fetches both under these same keys
  // while this menu's object is open, so this just reads that cache instead
  // of firing a fresh request.
  const { data: object } = useQuery({ queryKey: ["object", objectId], queryFn: () => objectApi.get(objectId) });
  const { data: members } = useQuery({ queryKey: ["workspaceMembers", workspaceId], queryFn: () => workspaceApi.members(workspaceId) });

  /** Shares the currently open object with `email` via chat: finds/creates a DM, sends the object's title + a deep link back to this exact block (see BlockEditor.tsx's `?block=` target, the same mechanism NotificationBell.tsx's @mention deep links use), then opens the chat overlay on that conversation so the sender sees it went through. */
  async function shareWithMember(email: string): Promise<void> {
    const conversation = await chatApi.createDm({ emails: [email] });
    const link = `${window.location.origin}/w/${workspaceId}/objects/${objectId}?block=${blockId}`;
    const title = object?.title || t("nav.untitled");
    await chatApi.sendMessage(conversation.id, { body: `${title}\n${link}` });
    chatOverlay.open(conversation.id);
  }

  const shareTargets = (members ?? []).filter((member) => member.userId !== currentUser?.id);

  // While locked, only actions that don't touch the block's content/
  // structure survive: Copy, Select all (both pure reads) and Share (sends a
  // chat message, never mutates the object). Everything else here -
  // Cut/Duplicate/Turn into/Clear formatting/Set block id/Delete - mutates
  // the block, which the lock exists to prevent, so those entries are
  // omitted entirely rather than shown disabled.
  const editingItems: ContextMenuEntry[] = readOnly
    ? []
    : [
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
      ];

  // Only shown when this block actually has a registered rich-text editor
  // (see editorRegistry.ts) - a block whose field has no formatting marks at
  // all (checklist items, ...) never registers one, so there'd be nothing to
  // clear. Clears bold/italic/color/alignment on the current selection
  // inside that editor's own instance - a plain `document.execCommand`
  // (used above for Copy/Cut when there's a selection) mutates the DOM
  // directly and risks desyncing it from ProseMirror's document model,
  // which every other command here avoids by going through TipTap/the block
  // editor's own mutations instead. `setTextAlign` only exists on a table
  // cell's editor (see TableFormatToolbar.tsx) - the markdown-based blocks
  // never load that extension (see useMarkdownEditor.ts), so it's applied
  // conditionally rather than assumed.
  const clearFormattingItem: ContextMenuEntry[] =
    !readOnly && richTextEditor
      ? [
          {
            key: "clear-formatting",
            label: t("editor.blockMenu.clearFormatting"),
            icon: "eraser",
            onSelect: () => {
              const chain = richTextEditor.chain().focus().unsetAllMarks();
              if (typeof richTextEditor.commands.setTextAlign === "function") chain.setTextAlign("left");
              chain.run();
            },
          },
        ]
      : [];

  const slugAndDeleteItems: ContextMenuEntry[] = readOnly
    ? []
    : [
        { key: "sep-2", separator: true },
        { key: "set-slug", label: t("editor.blockMenu.setBlockId"), icon: "braces", onSelect: () => setSlugEditorOpen(true) },
        { key: "sep-3", separator: true },
        { key: "delete", label: t("editor.blockMenu.deleteBlock"), icon: "trash", danger: true, onSelect: () => deleteBlock(blockId) },
      ];

  const items: ContextMenuEntry[] = [
    {
      key: "copy",
      label: t("editor.blockMenu.copy"),
      icon: "copy",
      onSelect: () => (hasSelection ? document.execCommand("copy") : copyBlock(blockId)),
    },
    ...editingItems,
    { key: "select-all", label: t("editor.blockMenu.selectAll"), icon: "select-all", onSelect: () => selectAllInEditor() },
    ...clearFormattingItem,
    { key: "sep-1", separator: true },
    {
      key: "share",
      label: t("editor.blockMenu.share"),
      icon: "share",
      submenu:
        shareTargets.length > 0
          ? shareTargets.map((member) => ({
              key: member.userId,
              label: member.user.name,
              onSelect: () => void shareWithMember(member.user.email),
            }))
          : [{ key: "no-members", label: t("editor.blockMenu.shareNoMembers"), disabled: true }],
    },
    ...slugAndDeleteItems,
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
