import type { BlockType, ObjectType, ParagraphContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";
import { useBlockEditor } from "../BlockEditorContext.js";

interface ParagraphBlockProps {
  content: ParagraphContent;
  onSave: (content: ParagraphContent) => Promise<void>;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onSlashSelect: (type: BlockType, extraContent?: Record<string, unknown>) => void;
  objectTypes: ObjectType[];
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

export function ParagraphBlock({
  content,
  onSave,
  onEnter,
  onBackspaceEmpty,
  onSlashSelect,
  objectTypes,
  autoFocus,
  onAutoFocused,
}: ParagraphBlockProps) {
  const { readOnly } = useBlockEditor();
  return (
    <RichTextEditor
      markdown={content.markdown ?? ""}
      className="tiptap prose-p:my-0 text-sm leading-relaxed"
      onSave={(markdown) => onSave({ ...content, markdown })}
      onEnter={onEnter}
      onBackspaceEmpty={onBackspaceEmpty}
      onSlashSelect={onSlashSelect}
      objectTypes={objectTypes}
      autoFocus={autoFocus}
      onAutoFocused={onAutoFocused}
      editable={!readOnly}
    />
  );
}
