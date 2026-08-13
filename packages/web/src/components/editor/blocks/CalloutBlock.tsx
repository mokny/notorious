import { useTranslation } from "react-i18next";
import type { CalloutContent } from "@notorious/shared";
import { TemplatableMarkdown } from "../TemplatableMarkdown.js";

const ICONS = ["💡", "⚠️", "📌", "✅", "🔥", "❗"];

export function CalloutBlock({
  blockId,
  content,
  onSave,
  onEnter,
}: {
  blockId: string;
  content: CalloutContent;
  onSave: (c: CalloutContent) => Promise<void>;
  onEnter: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="group/callout flex items-start gap-2 rounded-lg bg-accent/5 p-3">
      <select
        value={content.icon}
        onChange={(e) => onSave({ ...content, icon: e.target.value })}
        className="cursor-pointer rounded border-none bg-transparent text-lg opacity-50 group-focus-within/callout:opacity-100"
      >
        {ICONS.map((icon) => (
          <option key={icon} value={icon}>
            {icon}
          </option>
        ))}
      </select>
      <div className="flex-1 pt-1">
        <TemplatableMarkdown
          blockId={blockId}
          field="markdown"
          markdown={content.markdown ?? ""}
          placeholder={t("editor.blocks.callout.placeholder")}
          onSave={(markdown) => onSave({ ...content, markdown })}
          onEnter={onEnter}
        />
      </div>
    </div>
  );
}
