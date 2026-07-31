import type { CalloutContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";
import { useBlockEditor } from "../BlockEditorContext.js";

const ICONS = ["💡", "⚠️", "📌", "✅", "🔥", "❗"];

export function CalloutBlock({ content, onSave, onEnter }: { content: CalloutContent; onSave: (c: CalloutContent) => Promise<void>; onEnter: () => void }) {
  const { readOnly } = useBlockEditor();
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
        <RichTextEditor
          markdown={content.markdown ?? ""}
          placeholder="Callout"
          onSave={(markdown) => onSave({ ...content, markdown })}
          onEnter={onEnter}
          editable={!readOnly}
        />
      </div>
    </div>
  );
}
