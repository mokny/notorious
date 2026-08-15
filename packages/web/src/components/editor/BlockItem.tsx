import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BlockType } from "@notorious/shared";
import type { BlockNode } from "./blockTree.js";
import { BlockRenderer } from "./BlockRenderer.js";
import { BlockList } from "./BlockList.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { BlockSlugButton } from "./BlockSlugButton.js";
import { BlockContextMenu } from "./BlockContextMenu.js";
import { Icon } from "../ui/Icon.js";
import { useHasHover } from "../../hooks/useHasHover.js";
import { SWIPE_DELETE_THRESHOLD_PX } from "./blockGestures.js";
import { isNativeMenuOverride } from "../ui/ContextMenu.js";
import { useLongPressToOpenMenu } from "../../hooks/useLongPressToOpenMenu.js";
import { useTwoFingerTap } from "../../hooks/useTwoFingerTap.js";

export function BlockItem({ block }: { block: BlockNode }) {
  const { t } = useTranslation();
  const {
    workspaceId,
    objectId,
    objectTypes,
    embedAncestorIds,
    readOnly,
    createBlockAfter,
    updateBlockContent,
    toggleChecklistItem,
    reorderChecklistItems,
    toggleWhiteboardPresenting,
    updateVotingSettings,
    deleteBlock,
    pendingFocusBlockId,
    clearPendingFocus,
    isDraggingAny,
    onTouchArmStart,
    selectBlock,
    contextMenu,
    openBlockMenu,
  } = useBlockEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  // No real hover on touch (see useHasHover.ts) - that's when the row itself
  // becomes the long-press drag source (see the row's conditional `listeners`
  // spread below) instead of just the dedicated grip handle, and the id/
  // delete/add-below buttons disappear from their gutters entirely (see
  // BlockContextMenu.tsx and BlockList.tsx's own "Add block" for where those
  // moved to) to reclaim the width they always reserved even while hidden.
  const hasHover = useHasHover();
  // Long-press must not fight text selection/cursor placement while actually
  // typing in this block - so the row only becomes a drag source between
  // edits, not during one. Tracked via focus bubbling (React's onFocus fires
  // for descendant focus same as native focusin), not TipTap/editor state
  // directly, so this works the same for every block type's own editable
  // surface (contentEditable, <textarea>, Excalidraw canvas, ...).
  const [isEditingContent, setIsEditingContent] = useState(false);
  const canLongPressDrag = !hasHover && !readOnly && !isEditingContent;
  // Locked: still opens on a long-press, just via a plain timer instead of
  // dnd-kit's drag machinery - arming that (see `canLongPressDrag` above)
  // would also make the row draggable/swipeable, and reordering/deleting is
  // exactly what a lock should block (see BlockContextMenu.tsx, which
  // itself hides every action that isn't safe while locked).
  const longPressToOpenMenu = useLongPressToOpenMenu((x, y) => openBlockMenu(block.id, x, y));
  const canLongPressOpenMenuOnly = !hasHover && readOnly && !isEditingContent;
  // A quick two-finger tap opens the menu too - faster than a long-press,
  // and independent of the drag/lock/editing state above since it's never
  // ambiguous with any single-finger gesture (drag, swipe, text selection).
  const twoFingerTap = useTwoFingerTap((x, y) => openBlockMenu(block.id, x, y));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && hasHover ? 0.5 : 1,
    boxShadow: isDragging && !hasHover ? "0 8px 24px rgb(0 0 0 / 0.25)" : undefined,
    // iOS Safari's own long-press gesture on a link/image (the "peek"
    // preview popup) fires from the same touch-and-hold this row's long-
    // press-drag listens for, and wins the race - a block containing a link
    // (e.g. a sub_object reference) opened link previews instead of ever
    // reaching the drag/menu gesture. `-webkit-touch-callout` is what that
    // popup is gated on; it's inherited, so setting it here on the row
    // reaches every link/image inside without touching each block type.
    WebkitTouchCallout: !hasHover ? ("none" as const) : undefined,
  };
  // How far left the row has been dragged, as a 0-1 fraction of the delete
  // threshold - drives the red delete-reveal panel's opacity below (see
  // blockGestures.ts; BlockEditor.tsx's handleDragEnd applies the same
  // threshold to decide whether a release actually deletes).
  const deleteRevealProgress =
    isDragging && !hasHover && transform && transform.x < 0 ? Math.min(1, -transform.x / SWIPE_DELETE_THRESHOLD_PX) : 0;

  function renderColumn(columnIndex: number) {
    const children = block.children.filter((child) => (child.content as { columnIndex?: number }).columnIndex === columnIndex);
    return <BlockList blocks={children} parentBlockId={block.id} extraContentForNewBlocks={{ columnIndex }} />;
  }

  return (
    // Outer wrapper stays static (no transform) so the delete-reveal panel
    // below sits fixed in place while the actual row (the drag source, one
    // level in) slides left over it - see deleteRevealProgress above.
    // `data-block-id` is the scroll-to-match anchor for search navigation
    // (see BlockEditor.tsx's search-highlight scroll effect).
    <div className="relative" data-block-id={block.id}>
      {deleteRevealProgress > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 flex w-24 items-center justify-end rounded-md bg-red-500 pr-4 text-white"
          style={{ opacity: deleteRevealProgress }}
        >
          <Icon name="trash" className="h-4 w-4" />
        </div>
      )}

      {/* Named group ("item", not the bare default) - a block editor nests
          many of these inside one outer "editor"-named group (see
          BlockEditor.tsx), and CSS :hover propagates to every ancestor of
          whatever's under the pointer. With everyone sharing the same
          unnamed "group", hovering *any* block satisfied the outer group's
          hover state too, which made every block's controls appear at once
          instead of just the hovered one's. */}
      <div
        ref={setNodeRef}
        style={style}
        onClick={() => selectBlock(block.id)}
        // Selecting a block no longer highlights it here - see
        // BlockHistoryPanel.tsx, which now identifies which block its
        // entries belong to with a description line instead.
        // Desktop right-click replacement for the browser's native menu -
        // Shift+right-click is the universal escape hatch back to it (see
        // isNativeMenuOverride), left alone here so Inspect Element etc.
        // still work. Still opens while locked/read-only - BlockContextMenu.tsx
        // itself filters the item list down to whatever isn't affected by the
        // lock (Copy, Select all, Share, ...) rather than gating the trigger.
        onContextMenu={(event) => {
          if (isNativeMenuOverride(event)) return;
          event.preventDefault();
          openBlockMenu(block.id, event.clientX, event.clientY);
        }}
        onFocus={() => setIsEditingContent(true)}
        onBlur={() => setIsEditingContent(false)}
        // Touch only, and only between edits (see canLongPressDrag above) -
        // the whole row becomes the long-press drag source instead of just
        // the (on touch, removed) grip handle, so a long-press anywhere then
        // a swipe left/up/down deletes/reorders it (see BlockEditor.tsx's
        // handleDragEnd). Deliberately just `listeners`, not `attributes` -
        // the latter's `role="button" tabIndex={0}` etc. are meant for a
        // dedicated handle, not a row that already contains its own
        // interactive content (text, checkboxes, ...).
        {...(canLongPressDrag ? listeners : {})}
        {...(canLongPressOpenMenuOnly ? longPressToOpenMenu : {})}
        {...twoFingerTap}
        onPointerDownCapture={canLongPressDrag ? onTouchArmStart : undefined}
        className={`group/item relative flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-surface-raised/60 ${!hasHover ? "bg-surface" : ""} ${
          isDragging && !hasHover ? "z-10 scale-[1.02]" : ""
        }`}
      >
        {hasHover && (
          <div className="mt-1 flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => createBlockAfter(block.parentBlockId, block.id, "paragraph")}
              className="rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-ink group-hover/item:opacity-100 [@media(pointer:coarse)]:p-2"
              title={t("editor.blockItem.addBlockBelow")}
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
            </button>
            <button
              {...attributes}
              {...listeners}
              onPointerDownCapture={onTouchArmStart}
              className={`cursor-grab touch-none rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink [@media(pointer:coarse)]:p-2 ${
                isDraggingAny ? "opacity-100" : "opacity-0 group-hover/item:opacity-100"
              }`}
              title={t("editor.blockItem.dragToReorder")}
            >
              <Icon name="grip-vertical" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <BlockRenderer
            block={block}
            workspaceId={workspaceId}
            objectId={objectId}
            onSave={(content) => updateBlockContent(block.id, content)}
            onToggleChecklistItem={(itemId, checked) => toggleChecklistItem(block.id, itemId, checked)}
            onReorderChecklistItems={(itemIds) => reorderChecklistItems(block.id, itemIds)}
            onToggleWhiteboardPresenting={(presenting) => toggleWhiteboardPresenting(block.id, presenting)}
            onUpdateVotingSettings={(allowMultipleVotes, votingEndsAt) => updateVotingSettings(block.id, allowMultipleVotes, votingEndsAt)}
            onEnter={() => createBlockAfter(block.parentBlockId, block.id, "paragraph")}
            onBackspaceEmpty={() => deleteBlock(block.id)}
            onSlashSelect={(type: BlockType, extraContent?: Record<string, unknown>) =>
              createBlockAfter(block.parentBlockId, block.id, type, extraContent)
            }
            objectTypes={objectTypes}
            embedAncestorIds={embedAncestorIds}
            renderColumn={renderColumn}
            toggleChildren={<BlockList blocks={block.children} parentBlockId={block.id} />}
            autoFocus={block.id === pendingFocusBlockId}
            onAutoFocused={clearPendingFocus}
          />
        </div>

        {hasHover && <BlockSlugButton objectId={objectId} blockId={block.id} slug={block.slug} />}

        {hasHover && (
          <button
            onClick={() => deleteBlock(block.id)}
            className="mt-1 shrink-0 rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-red-500 group-hover/item:opacity-100 [@media(pointer:coarse)]:p-2"
            title={t("editor.blockItem.deleteBlock")}
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
          </button>
        )}

        {contextMenu?.blockId === block.id && (
          <BlockContextMenu blockId={block.id} slug={block.slug} type={block.type} x={contextMenu.x} y={contextMenu.y} />
        )}
      </div>
    </div>
  );
}
