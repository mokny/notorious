import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { BlockType } from "@notorious/shared";
import { blockApi, fileApi } from "../../lib/api/resources.js";
import { buildBlockTree } from "./blockTree.js";
import { BlockEditorProvider } from "./BlockEditorContext.js";
import { BlockList } from "./BlockList.js";
import { Button } from "../ui/Button.js";
import { Icon } from "../ui/Icon.js";

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const dragDepth = useRef(0);

  const { data: blocks } = useQuery({ queryKey: ["blocks", objectId], queryFn: () => blockApi.list(objectId) });
  const tree = buildBlockTree(blocks ?? []);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["blocks", objectId] });
  }

  const createMutation = useMutation({
    mutationFn: (input: { parentBlockId: string | null; afterBlockId: string | null; type: BlockType; content: Record<string, unknown> }) =>
      blockApi.create({ objectId, parentBlockId: input.parentBlockId, afterBlockId: input.afterBlockId, type: input.type, content: input.content }),
    onSuccess: (createdBlock) => {
      invalidate();
      setPendingFocusBlockId(createdBlock.id);
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
        updateBlockContent: (blockId, content) => updateMutation.mutateAsync({ blockId, content }).then(() => undefined),
        deleteBlock: (blockId) => deleteMutation.mutate(blockId),
        moveBlock: (blockId, parentBlockId, afterBlockId) => moveMutation.mutate({ blockId, parentBlockId, afterBlockId }),
        pendingFocusBlockId,
        clearPendingFocus: () => setPendingFocusBlockId(null),
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
      </div>
    </BlockEditorProvider>
  );
}
