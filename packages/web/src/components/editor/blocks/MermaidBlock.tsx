import { useEffect, useId, useState } from "react";
import type { MermaidContent } from "@notorious/shared";

export function MermaidBlock({ content, onSave }: { content: MermaidContent; onSave: (c: MermaidContent) => void }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!content.code?.trim()) {
      setSvg("");
      return;
    }

    import("mermaid").then(async (mod) => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "neutral" });
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, content.code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not render this diagram");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [content.code, id]);

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <textarea
        value={content.code ?? ""}
        onChange={(e) => onSave({ code: e.target.value })}
        placeholder={"graph TD\n  A --> B"}
        rows={4}
        className="w-full resize-y border-none bg-transparent font-mono text-sm outline-none"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {svg && <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}
