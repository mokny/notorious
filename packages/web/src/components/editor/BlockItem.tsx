import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BlockType } from "@notorious/shared";
import type { BlockNode } from "./blockTree.js";
import { BlockRenderer } from "./BlockRenderer.js";
import { BlockList } from "./BlockList.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { Icon } from "../ui/Icon.js";

export function BlockItem({ block }: { block: BlockNode }) {
  const { workspaceId, objectId, createBlockAfter, updateBlockContent, deleteBlock } = useBlockEditor();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  function renderColumn(columnIndex: number) {
    const children = block.children.filter((child) => (child.content as { columnIndex?: number }).columnIndex === columnIndex);
    return <BlockList blocks={children} parentBlockId={block.id} extraContentForNewBlocks={{ columnIndex }} />;
  }

  return (
    <div ref={setNodeRef} style={style} className="group flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-surface-raised/60">
      <div className="mt-1 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          onClick={() => createBlockAfter(block.parentBlockId, block.id, "paragraph")}
          className="rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink"
          title="Add block below"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
        </button>
        <button {...attributes} {...listeners} className="cursor-grab rounded p-0.5 text-ink-muted hover:bg-surface hover:text-ink" title="Drag to reorder">
          <Icon name="grip-vertical" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <BlockRenderer
          block={block}
          workspaceId={workspaceId}
          objectId={objectId}
          onSave={(content) => updateBlockContent(block.id, content)}
          onEnter={() => createBlockAfter(block.parentBlockId, block.id, "paragraph")}
          onBackspaceEmpty={() => deleteBlock(block.id)}
          onSlashSelect={(type: BlockType) => createBlockAfter(block.parentBlockId, block.id, type)}
          renderColumn={renderColumn}
          toggleChildren={<BlockList blocks={block.children} parentBlockId={block.id} />}
        />
      </div>

      <button
        onClick={() => deleteBlock(block.id)}
        className="mt-1 shrink-0 rounded p-0.5 text-ink-muted opacity-0 hover:bg-surface hover:text-red-500 group-hover:opacity-100"
        title="Delete block"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
