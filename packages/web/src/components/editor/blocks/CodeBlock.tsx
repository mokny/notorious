import type { CodeContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";

const LANGUAGES = ["text", "bash", "javascript", "typescript", "python", "json", "sql", "yaml", "html", "css"];

export function CodeBlock({
  content: externalContent,
  onSave,
}: {
  content: CodeContent;
  onSave: (c: CodeContent) => Promise<void>;
}) {
  const [content, save] = useDebouncedSave(externalContent, onSave);
  return (
    <div className="group/code overflow-hidden rounded-lg border border-border bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <select
          value={content.language ?? "text"}
          onChange={(e) => save({ ...content, language: e.target.value })}
          className="invisible rounded bg-transparent text-xs text-slate-300 group-focus-within/code:visible"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang} className="bg-[#0d1117]">
              {lang}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={content.code ?? ""}
        onChange={(e) => save({ ...content, code: e.target.value })}
        spellCheck={false}
        rows={Math.max(3, (content.code ?? "").split("\n").length)}
        className="w-full resize-none border-none bg-transparent p-3 font-mono text-sm text-slate-100 outline-none"
      />
    </div>
  );
}
