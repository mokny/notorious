import { useEffect, useState, type ReactNode } from "react";
import type { ToggleContent } from "@notorious/shared";
import { TemplatableMarkdown } from "../TemplatableMarkdown.js";
import { Icon } from "../../ui/Icon.js";
import { useBlockEditor } from "../BlockEditorContext.js";

interface ToggleBlockProps {
  blockId: string;
  content: ToggleContent;
  onSave: (content: ToggleContent) => Promise<void>;
  children: ReactNode;
}

export function ToggleBlock({ blockId, content, onSave, children }: ToggleBlockProps) {
  const [open, setOpen] = useState(true);
  // A search-match navigation force-opens a closed toggle that hides its
  // target (see BlockEditor.tsx's ancestor-chain scroll effect) - `open`
  // stays a plain local toggle otherwise, this just seeds it back to true
  // when this block's id enters that set.
  const { forcedOpenBlockIds } = useBlockEditor();
  useEffect(() => {
    if (forcedOpenBlockIds.has(blockId)) setOpen(true);
  }, [forcedOpenBlockIds, blockId]);

  return (
    <div>
      <div className="flex items-start gap-1">
        <button onClick={() => setOpen((v) => !v)} data-view-toggle className="mt-1 text-ink-muted hover:text-ink">
          <Icon name={open ? "chevron-down" : "chevron-right"} className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <TemplatableMarkdown
            blockId={blockId}
            field="summaryMarkdown"
            markdown={content.summaryMarkdown ?? ""}
            placeholder="Toggle"
            onSave={(summaryMarkdown) => onSave({ ...content, summaryMarkdown })}
          />
        </div>
      </div>
      {open && <div className="ml-5 mt-1 space-y-1 border-l border-border pl-3">{children}</div>}
    </div>
  );
}
