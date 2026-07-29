import type { HeadingContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";

const SIZE_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-2xl font-semibold",
  2: "text-xl font-semibold",
  3: "text-lg font-semibold",
};

interface HeadingBlockProps {
  content: HeadingContent;
  onSave: (content: HeadingContent) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
}

export function HeadingBlock({ content, onSave, onEnter, onBackspaceEmpty }: HeadingBlockProps) {
  return (
    <div className={SIZE_CLASS[content.level]}>
      <div className="flex items-center gap-2">
        <select
          value={content.level}
          onChange={(e) => onSave({ ...content, level: Number(e.target.value) as 1 | 2 | 3 })}
          className="rounded border border-border bg-transparent text-xs font-normal text-ink-muted"
        >
          <option value={1}>H1</option>
          <option value={2}>H2</option>
          <option value={3}>H3</option>
        </select>
        <RichTextEditor
          markdown={content.markdown ?? ""}
          className="tiptap flex-1"
          placeholder="Heading"
          onSave={(markdown) => onSave({ ...content, markdown })}
          onEnter={onEnter}
          onBackspaceEmpty={onBackspaceEmpty}
        />
      </div>
    </div>
  );
}
