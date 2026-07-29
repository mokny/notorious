import { useState, type ReactNode } from "react";
import type { ToggleContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";
import { Icon } from "../../ui/Icon.js";

interface ToggleBlockProps {
  content: ToggleContent;
  onSave: (content: ToggleContent) => Promise<void>;
  children: ReactNode;
}

export function ToggleBlock({ content, onSave, children }: ToggleBlockProps) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div className="flex items-start gap-1">
        <button onClick={() => setOpen((v) => !v)} className="mt-1 text-ink-muted hover:text-ink">
          <Icon name={open ? "chevron-down" : "chevron-right"} className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <RichTextEditor
            markdown={content.summaryMarkdown ?? ""}
            placeholder="Toggle"
            onSave={(summaryMarkdown) => onSave({ summaryMarkdown })}
          />
        </div>
      </div>
      {open && <div className="ml-5 mt-1 space-y-1 border-l border-border pl-3">{children}</div>}
    </div>
  );
}
