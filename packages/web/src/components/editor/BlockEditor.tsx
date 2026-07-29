import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { BlockType } from "@notorious/shared";
import { blockApi } from "../../lib/api/resources.js";
import { buildBlockTree } from "./blockTree.js";
import { BlockEditorProvider } from "./BlockEditorContext.js";
import { BlockList } from "./BlockList.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";

export function BlockEditor({ workspaceId, objectId }: { workspaceId: string; objectId: string }) {
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { data: blocks } = useQuery({ queryKey: ["blocks", objectId], queryFn: () => blockApi.list(objectId) });
  const tree = buildBlockTree(blocks ?? []);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["blocks", objectId] });
  }

  const createMutation = useMutation({
    mutationFn: (input: { parentBlockId: string | null; afterBlockId: string | null; type: BlockType; content: Record<string, unknown> }) =>
      blockApi.create({ objectId, parentBlockId: input.parentBlockId, afterBlockId: input.afterBlockId, type: input.type, content: input.content }),
    onSuccess: invalidate,
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
    onSuccess: invalidate,
  });

  const importMutation = useMutation({
    mutationFn: (markdown: string) => blockApi.importMarkdown(objectId, markdown),
    onSuccess: invalidate,
  });

  function defaultContentFor(type: BlockType): Record<string, unknown> {
    switch (type) {
      case "heading":
        return { markdown: "", level: 2 };
      case "checklist":
        return { items: [] };
      case "table":
        return { columns: ["Column 1", "Column 2"], rows: [[]] };
      case "code":
        return { code: "", language: "text" };
      case "callout":
        return { markdown: "", icon: "💡" };
      case "columns":
        return { columnCount: 2 };
      case "toggle":
        return { summaryMarkdown: "" };
      default:
        return {};
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const blockId = String(event.active.id);
    const overId = String(event.over.id);
    const overBlock = (blocks ?? []).find((b) => b.id === overId);
    if (!overBlock) return;
    moveMutation.mutate({ blockId, parentBlockId: overBlock.parentBlockId, afterBlockId: overBlock.id });
  }

  return (
    <BlockEditorProvider
      value={{
        workspaceId,
        objectId,
        createBlockAfter: (parentBlockId, afterBlockId, type, extraContent) =>
          createMutation.mutate({ parentBlockId, afterBlockId, type, content: { ...defaultContentFor(type), ...extraContent } }),
        updateBlockContent: (blockId, content) => updateMutation.mutate({ blockId, content }),
        deleteBlock: (blockId) => deleteMutation.mutate(blockId),
        moveBlock: (blockId, parentBlockId, afterBlockId) => moveMutation.mutate({ blockId, parentBlockId, afterBlockId }),
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" onClick={() => window.open(blockApi.exportMarkdownUrl(objectId), "_blank")}>
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

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="group">
          <BlockList blocks={tree} parentBlockId={null} />
        </div>
      </DndContext>
    </BlockEditorProvider>
  );
}
