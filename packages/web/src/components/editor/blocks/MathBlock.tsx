import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { MathContent } from "@notorious/shared";

export function MathBlock({ content, onSave }: { content: MathContent; onSave: (c: MathContent) => void }) {
  const rendered = useMemo(() => {
    try {
      return katex.renderToString(content.latex || "", { throwOnError: false, displayMode: true });
    } catch {
      return "";
    }
  }, [content.latex]);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <textarea
        value={content.latex ?? ""}
        onChange={(e) => onSave({ latex: e.target.value })}
        placeholder="e.g. E = mc^2"
        rows={2}
        className="w-full resize-none border-none bg-transparent font-mono text-sm outline-none"
      />
      {content.latex && <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: rendered }} />}
    </div>
  );
}
