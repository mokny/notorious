import { useTranslation } from "react-i18next";
import type { HeadingContent } from "@notorious/shared";
import { TemplatableMarkdown } from "../TemplatableMarkdown.js";
import { useFocusWithin } from "../../../hooks/useFocusWithin.js";

const SIZE_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-2xl font-semibold",
  2: "text-xl font-semibold",
  3: "text-lg font-semibold",
};

interface HeadingBlockProps {
  blockId: string;
  content: HeadingContent;
  onSave: (content: HeadingContent) => Promise<void>;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

export function HeadingBlock({ blockId, content, onSave, onEnter, onBackspaceEmpty, autoFocus, onAutoFocused }: HeadingBlockProps) {
  const { t } = useTranslation();
  const { isFocused, containerRef, handlers } = useFocusWithin<HTMLDivElement>();

  return (
    <div className={SIZE_CLASS[content.level]}>
      <div ref={containerRef} className="flex items-center gap-2" {...handlers}>
        {/* Rendered only while focused, not just visually hidden - an
            `invisible` select still reserves its box, indenting the heading
            text to make room for a control nobody can see. */}
        {isFocused && (
          <select
            value={content.level}
            onChange={(e) => onSave({ ...content, level: Number(e.target.value) as 1 | 2 | 3 })}
            className="rounded border border-border bg-transparent text-xs font-normal text-ink-muted"
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        )}
        <TemplatableMarkdown
          blockId={blockId}
          field="markdown"
          markdown={content.markdown ?? ""}
          className="tiptap flex-1"
          placeholder={t("editor.blocks.heading.placeholder")}
          onSave={(markdown) => onSave({ ...content, markdown })}
          onEnter={onEnter}
          onBackspaceEmpty={onBackspaceEmpty}
          autoFocus={autoFocus}
          onAutoFocused={onAutoFocused}
        />
      </div>
    </div>
  );
}
