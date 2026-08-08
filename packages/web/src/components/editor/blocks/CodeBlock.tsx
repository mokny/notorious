import type { CodeContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { useFocusWithin } from "../../../hooks/useFocusWithin.js";
import { useBlockEditor } from "../BlockEditorContext.js";

const LANGUAGES = ["text", "bash", "javascript", "typescript", "python", "json", "sql", "yaml", "html", "css"];

export function CodeBlock({
  content: externalContent,
  onSave,
}: {
  content: CodeContent;
  onSave: (c: CodeContent) => Promise<void>;
}) {
  const [content, save] = useDebouncedSave(externalContent, onSave);
  const { isFocused, containerRef, handlers } = useFocusWithin<HTMLDivElement>();
  // Native `readOnly`, not `disabled` - keeps the textarea exempt from
  // ObjectDetailPage.tsx's blanket `pointer-events-none` lock rule (see
  // READ_ONLY_CONTENT_CLASS's doc comment), so scrolling and text
  // selection/copy still work on a locked object, same as ChecklistBlock.tsx.
  const { readOnly } = useBlockEditor();

  return (
    <div ref={containerRef} className="overflow-hidden rounded-lg border border-border bg-[#0d1117]" {...handlers}>
      {/* Rendered only while focused, not just visually hidden - an
          `invisible` select still reserves this whole header bar, leaving an
          empty strip above the code for a control nobody can see. */}
      {isFocused && (
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
          <select
            value={content.language ?? "text"}
            onChange={(e) => save({ ...content, language: e.target.value })}
            disabled={readOnly}
            className="rounded bg-transparent text-xs text-slate-300 disabled:opacity-50"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang} className="bg-[#0d1117]">
                {lang}
              </option>
            ))}
          </select>
        </div>
      )}
      <textarea
        value={content.code ?? ""}
        onChange={(e) => save({ ...content, code: e.target.value })}
        readOnly={readOnly}
        spellCheck={false}
        rows={Math.max(3, (content.code ?? "").split("\n").length)}
        className="w-full resize-none border-none bg-transparent p-3 font-mono text-sm text-slate-100 outline-none"
      />
    </div>
  );
}
