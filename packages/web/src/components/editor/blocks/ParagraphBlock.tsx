import type { BlockType, ParagraphContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";

interface ParagraphBlockProps {
  content: ParagraphContent;
  onSave: (content: ParagraphContent) => Promise<void>;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onSlashSelect: (type: BlockType) => void;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

export function ParagraphBlock({
  content,
  onSave,
  onEnter,
  onBackspaceEmpty,
  onSlashSelect,
  autoFocus,
  onAutoFocused,
}: ParagraphBlockProps) {
  return (
    <RichTextEditor
      markdown={content.markdown ?? ""}
      className="tiptap prose-p:my-0 text-sm leading-relaxed"
      onSave={(markdown) => onSave({ ...content, markdown })}
      onEnter={onEnter}
      onBackspaceEmpty={onBackspaceEmpty}
      onSlashSelect={onSlashSelect}
      autoFocus={autoFocus}
      onAutoFocused={onAutoFocused}
    />
  );
}
