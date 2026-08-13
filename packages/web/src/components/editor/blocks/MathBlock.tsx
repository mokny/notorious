import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { MathContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";

export function MathBlock({
  content: externalContent,
  onSave,
}: {
  content: MathContent;
  onSave: (c: MathContent) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, save] = useDebouncedSave(externalContent, onSave);
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
        onChange={(e) => save({ ...content, latex: e.target.value })}
        placeholder={t("editor.blocks.math.placeholder")}
        rows={2}
        className="w-full resize-none border-none bg-transparent font-mono text-sm outline-none"
      />
      {content.latex && <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: rendered }} />}
    </div>
  );
}
