import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPopper } from "@popperjs/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BlockType } from "@notorious/shared";
import type { BlockNode } from "./blockTree.js";
import { BlockItem } from "./BlockItem.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { buildSlashCommandItems } from "./SlashCommand.js";
import { popupPopperOptions } from "./popupPositioning.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { useHasHover } from "../../hooks/useHasHover.js";
import { Icon } from "../ui/Icon.js";

interface BlockListProps {
  blocks: BlockNode[];
  parentBlockId: string | null;
  extraContentForNewBlocks?: Record<string, unknown>;
}

/** Renders one nesting level's siblings as a sortable list, with an "add block" affordance at the end. */
export function BlockList({ blocks, parentBlockId, extraContentForNewBlocks }: BlockListProps) {
  const { t } = useTranslation();
  const { createBlockAfter, objectTypes } = useBlockEditor();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasHover = useHasHover();
  useClickOutside(pickerRef, () => setPickerOpen(false), pickerOpen);
  const items = buildSlashCommandItems(objectTypes);

  // Positions the menu with Popper's flip/preventOverflow/maxSize (same
  // popupPopperOptions as SlashCommand.ts's popup) instead of a fixed
  // `absolute left-0 mt-1`, which used to hang off-screen whenever the
  // button sat near the bottom or right edge of a long block list.
  useEffect(() => {
    if (!pickerOpen || !buttonRef.current || !menuRef.current) return;
    const popper = createPopper(buttonRef.current, menuRef.current, {
      placement: "bottom-start",
      modifiers: [{ name: "offset", options: { offset: [0, 4] } }, ...(popupPopperOptions.modifiers ?? [])],
    });
    return () => popper.destroy();
  }, [pickerOpen]);

  return (
    <div className="space-y-0.5">
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block) => (
          <BlockItem key={block.id} block={block} />
        ))}
      </SortableContext>

      <div className="relative" ref={pickerRef}>
        <button
          ref={buttonRef}
          data-lock-hide
          onClick={() => setPickerOpen((v) => !v)}
          className={
            hasHover
              ? "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted opacity-0 hover:bg-surface-raised hover:opacity-100 group-hover/editor:opacity-100"
              : "flex items-center gap-1 rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-surface-raised"
          }
        >
          <Icon name="plus" className={hasHover ? "h-3 w-3" : "h-4 w-4"} /> {t("editor.blockList.addBlock")}
        </button>
        {/* z-50 (not z-20 like most editor popups) so it clears the mobile
            bottom bar / bottom fade gradient (both z-20, and later in
            WorkspaceLayout.tsx's DOM order, so an equal z-index would paint
            over this popup when it opens near the bottom of the screen) -
            same tier BlockSlugButton.tsx uses to clear the mobile sidebar. */}
        {pickerOpen && (
          <div ref={menuRef} className="slash-menu z-50">
            {items.map((item, index) => (
              <button
                // Object types can share a type/label with each other (never
                // with the fixed items above them, which all have distinct
                // `type`s) - index disambiguates without needing every
                // `SlashCommandItem` to carry its own unique key field.
                key={`${item.type}-${item.objectTypeId ?? index}`}
                className="slash-item"
                onClick={() => {
                  const lastId = blocks[blocks.length - 1]?.id ?? null;
                  const extra = item.objectTypeId
                    ? { ...extraContentForNewBlocks, objectId: null, pendingObjectTypeId: item.objectTypeId }
                    : extraContentForNewBlocks;
                  createBlockAfter(parentBlockId, lastId, item.type as BlockType, extra);
                  setPickerOpen(false);
                }}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
