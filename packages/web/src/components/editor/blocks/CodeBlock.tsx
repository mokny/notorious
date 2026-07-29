import type { CodeContent } from "@notorious/shared";

const LANGUAGES = ["text", "bash", "javascript", "typescript", "python", "json", "sql", "yaml", "html", "css"];

export function CodeBlock({ content, onSave }: { content: CodeContent; onSave: (c: CodeContent) => void }) {
  return (
    <div className="group/code overflow-hidden rounded-lg border border-border bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <select
          value={content.language ?? "text"}
          onChange={(e) => onSave({ ...content, language: e.target.value })}
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
        onChange={(e) => onSave({ ...content, code: e.target.value })}
        spellCheck={false}
        rows={Math.max(3, (content.code ?? "").split("\n").length)}
        className="w-full resize-none border-none bg-transparent p-3 font-mono text-sm text-slate-100 outline-none"
      />
    </div>
  );
}
