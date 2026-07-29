import { useRef, useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BlockType } from "@notorious/shared";
import type { BlockNode } from "./blockTree.js";
import { BlockItem } from "./BlockItem.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { SLASH_COMMAND_ITEMS } from "./SlashCommand.js";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { Icon } from "../ui/Icon.js";

interface BlockListProps {
  blocks: BlockNode[];
  parentBlockId: string | null;
  extraContentForNewBlocks?: Record<string, unknown>;
}

/** Renders one nesting level's siblings as a sortable list, with an "add block" affordance at the end. */
export function BlockList({ blocks, parentBlockId, extraContentForNewBlocks }: BlockListProps) {
  const { createBlockAfter } = useBlockEditor();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(pickerRef, () => setPickerOpen(false), pickerOpen);

  return (
    <div className="space-y-0.5">
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block) => (
          <BlockItem key={block.id} block={block} />
        ))}
      </SortableContext>

      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted opacity-0 hover:bg-surface-raised hover:opacity-100 group-hover:opacity-100"
        >
          <Icon name="plus" className="h-3 w-3" /> Add block
        </button>
        {pickerOpen && (
          <div className="slash-menu absolute left-0 z-20 mt-1">
            {SLASH_COMMAND_ITEMS.map((item) => (
              <button
                key={item.type}
                className="slash-item"
                onClick={() => {
                  const lastId = blocks[blocks.length - 1]?.id ?? null;
                  createBlockAfter(parentBlockId, lastId, item.type as BlockType, extraContentForNewBlocks);
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
