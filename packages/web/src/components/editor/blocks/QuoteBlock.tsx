import { useTranslation } from "react-i18next";
import type { QuoteContent } from "@notorious/shared";
import { TemplatableMarkdown } from "../TemplatableMarkdown.js";

export function QuoteBlock({
  blockId,
  content,
  onSave,
  onEnter,
}: {
  blockId: string;
  content: QuoteContent;
  onSave: (c: QuoteContent) => Promise<void>;
  onEnter: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-l-2 border-accent/60 pl-3 italic text-ink-muted">
      <TemplatableMarkdown
        blockId={blockId}
        field="markdown"
        markdown={content.markdown ?? ""}
        placeholder={t("editor.blocks.quote.placeholder")}
        onSave={(markdown) => onSave({ ...content, markdown })}
        onEnter={onEnter}
      />
    </div>
  );
}
