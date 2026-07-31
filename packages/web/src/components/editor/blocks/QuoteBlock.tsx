import type { QuoteContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";
import { useBlockEditor } from "../BlockEditorContext.js";

export function QuoteBlock({ content, onSave, onEnter }: { content: QuoteContent; onSave: (c: QuoteContent) => Promise<void>; onEnter: () => void }) {
  const { readOnly } = useBlockEditor();
  return (
    <div className="border-l-2 border-accent/60 pl-3 italic text-ink-muted">
      <RichTextEditor
        markdown={content.markdown ?? ""}
        placeholder="Quote"
        onSave={(markdown) => onSave({ ...content, markdown })}
        onEnter={onEnter}
        editable={!readOnly}
      />
    </div>
  );
}
