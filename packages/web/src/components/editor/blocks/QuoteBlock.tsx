import type { QuoteContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";

export function QuoteBlock({ content, onSave, onEnter }: { content: QuoteContent; onSave: (c: QuoteContent) => Promise<void>; onEnter: () => void }) {
  return (
    <div className="border-l-2 border-accent/60 pl-3 italic text-ink-muted">
      <RichTextEditor markdown={content.markdown ?? ""} placeholder="Quote" onSave={(markdown) => onSave({ ...content, markdown })} onEnter={onEnter} />
    </div>
  );
}
