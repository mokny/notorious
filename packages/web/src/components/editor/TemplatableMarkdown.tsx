import { useRef } from "react";
import type { BlockType, ObjectType } from "@notorious/shared";
import { RichTextEditor } from "./RichTextEditor.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { useTemplatableField } from "./useTemplatableField.js";

interface TemplatableMarkdownProps {
  /** This field's owning block id and its key in `renderedBlocks` (see useTemplatableField.ts). */
  blockId: string;
  field: string;
  markdown: string;
  placeholder?: string;
  className?: string;
  onSave: (markdown: string) => Promise<void>;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onSlashSelect?: (type: BlockType, extraContent?: Record<string, unknown>) => void;
  objectTypes?: ObjectType[];
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

/**
 * A RichTextEditor for a field that may contain `{{ }}`/`{% %}` template
 * syntax: shows the rendered value while unfocused, and the raw editable
 * source while focused (click to start editing, blur to render again).
 *
 * The two states are two separate RichTextEditor instances, switched via a
 * `key` change rather than toggling one persistent instance's `editable`
 * flag - toggling was empirically found to fire a spurious `onUpdate`
 * mid-transition that silently persisted the *rendered* text back as the
 * block's real source (see useMarkdownEditor.ts's `editableRef` comment).
 * Never mount both at once.
 */
export function TemplatableMarkdown({
  blockId,
  field,
  markdown,
  placeholder,
  className,
  onSave,
  onEnter,
  onBackspaceEmpty,
  onSlashSelect,
  objectTypes,
  autoFocus,
  onAutoFocused,
}: TemplatableMarkdownProps) {
  const { readOnly } = useBlockEditor();
  const { rendered, showRendered, startEditing, stopEditing } = useTemplatableField(blockId, field, autoFocus);
  // Clicking the rendered text swaps in a brand-new "edit" instance (see the
  // key change below), but a click that merely triggers a *remount* doesn't
  // itself place the browser's cursor into it - without this, the user would
  // see the raw source appear but still have to click a second time to
  // actually type. Reset once RichTextEditor's own autoFocus effect has run.
  const clickedToEditRef = useRef(false);

  if (showRendered) {
    return (
      <div
        className={readOnly ? undefined : "cursor-text"}
        onClick={() => {
          clickedToEditRef.current = true;
          startEditing();
        }}
      >
        <RichTextEditor key="rendered" markdown={rendered ?? ""} className={className} editable={false} onSave={() => Promise.resolve()} />
      </div>
    );
  }

  return (
    <RichTextEditor
      key="edit"
      markdown={markdown}
      placeholder={placeholder}
      className={className}
      onSave={onSave}
      onEnter={onEnter}
      onBackspaceEmpty={onBackspaceEmpty}
      onSlashSelect={onSlashSelect}
      objectTypes={objectTypes}
      autoFocus={autoFocus || clickedToEditRef.current}
      onAutoFocused={() => {
        clickedToEditRef.current = false;
        onAutoFocused?.();
      }}
      editable={!readOnly}
      onBlur={stopEditing}
    />
  );
}
