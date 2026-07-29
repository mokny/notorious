import type { CalloutContent } from "@notorious/shared";
import { RichTextEditor } from "../RichTextEditor.js";

const ICONS = ["💡", "⚠️", "📌", "✅", "🔥", "❗"];

export function CalloutBlock({ content, onSave, onEnter }: { content: CalloutContent; onSave: (c: CalloutContent) => Promise<void>; onEnter: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-accent/5 p-3">
      <select
        value={content.icon}
        onChange={(e) => onSave({ ...content, icon: e.target.value })}
        className="rounded border-none bg-transparent text-lg"
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
        />
      </div>
    </div>
  );
}
