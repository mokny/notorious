import { useEffect, useId, useState } from "react";
import type { MermaidContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";

export function MermaidBlock({
  content: externalContent,
  onSave,
}: {
  content: MermaidContent;
  onSave: (c: MermaidContent) => Promise<void>;
}) {
  const [content, save] = useDebouncedSave(externalContent, onSave);
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
        // `render()` alone doesn't throw on invalid syntax - it resolves
        // with mermaid's own built-in "error diagram" SVG instead (a large,
        // unstyled graphic with a bomb icon and the mermaid version number),
        // which would otherwise render as-is below. `parse()` does throw on
        // invalid syntax, so validating with it first is what lets the
        // catch block below show our own small error message instead.
        await mermaid.parse(content.code);
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, content.code);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Could not render this diagram - check the syntax");
          setSvg("");
        }
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
        onChange={(e) => save({ ...content, code: e.target.value })}
        placeholder={"graph TD\n  A --> B"}
        rows={4}
        className="w-full resize-y border-none bg-transparent font-mono text-sm outline-none"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {svg && <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}
