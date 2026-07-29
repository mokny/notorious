import type { BlockType, ParagraphContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";

interface ParagraphBlockProps {
  content: ParagraphContent;
  onSave: (content: ParagraphContent) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onSlashSelect: (type: BlockType) => void;
}

export function ParagraphBlock({ content, onSave, onEnter, onBackspaceEmpty, onSlashSelect }: ParagraphBlockProps) {
  return (
    <RichTextEditor
      markdown={content.markdown ?? ""}
      className="tiptap prose-p:my-0 text-sm leading-relaxed"
      onSave={(markdown) => onSave({ markdown })}
      onEnter={onEnter}
      onBackspaceEmpty={onBackspaceEmpty}
      onSlashSelect={onSlashSelect}
    />
  );
}
