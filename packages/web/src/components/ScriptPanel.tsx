import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ObjectRecord, ScriptRunResult } from "@notorious/shared";
import { scriptApi } from "../lib/api/resources.js";
import { useDebouncedSave } from "../hooks/useDebouncedSave.js";
import { Button } from "./ui/Button.js";
import { Icon } from "./ui/Icon.js";

const PLACEHOLDER = `// @automation
// (remove this comment for a manual-only script - see below)

// object.properties, object.blocks, object.relatedObjects(key) - read-only
// object.setProperty(key, value), object.setBlockContent(blockId, content),
// object.appendBlock(type, content) - staged, applied only if the script
// finishes without error. object.log(...) shows up below after you Run.

const table = object.blocks.find((b) => b.type === "table");
if (table) {
  const total = table.content.rows.reduce((sum, row) => sum + (Number(row[0]) || 0), 0);
  object.log("Column total:", total);
  object.appendBlock("callout", { markdown: \`**Total: \${total}**\`, icon: "🧮" });
}`;

function ScriptRunOutput({ result }: { result: ScriptRunResult }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border p-2">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${result.success ? "text-emerald-500" : "text-red-500"}`}>
        <Icon name={result.success ? "check-square" : "close"} className="h-3.5 w-3.5" />
        {result.success ? "Success" : "Failed"}
        <span className="font-normal text-ink-muted">
          · {result.triggerType} · {result.durationMs}ms · {new Date(result.ranAt).toLocaleString()}
        </span>
      </div>
      {result.error && <p className="text-xs text-red-500">{result.error}</p>}
      {result.log && <pre className="whitespace-pre-wrap break-words text-xs text-ink-muted">{result.log}</pre>}
    </div>
  );
}

export function ScriptPanel({ object }: { workspaceId: string; object: ObjectRecord }) {
  const queryClient = useQueryClient();

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["object", object.id] });
    void queryClient.invalidateQueries({ queryKey: ["blocks", object.id] });
  }

  const [source, setSource] = useDebouncedSave(object.scriptSource ?? "", (value) =>
    scriptApi.updateSource(object.id, { scriptSource: value.length > 0 ? value : null }).then(() => undefined),
  );

  const enabledMutation = useMutation({
    mutationFn: (enabled: boolean) => scriptApi.setEnabled(object.id, { enabled }),
    onSuccess: invalidate,
  });

  const runMutation = useMutation({
    mutationFn: () => scriptApi.run(object.id),
    onSuccess: invalidate,
  });

  const lastResult = runMutation.data ?? object.scriptLastRun;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => runMutation.mutate()} disabled={runMutation.isPending || !source}>
          <Icon name="play" className="h-3.5 w-3.5" /> {runMutation.isPending ? "Running…" : "Run"}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={object.scriptEnabled}
            onChange={(e) => enabledMutation.mutate(e.target.checked)}
          />
          Automation enabled
        </label>
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        placeholder={PLACEHOLDER}
        rows={12}
        className="w-full resize-y rounded-lg border border-border bg-surface-raised p-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-accent"
      />
      <p className="text-xs text-ink-muted">
        Start the script with <code className="rounded bg-surface-raised px-1 py-0.5">// @automation</code> to also run it
        automatically (debounced) whenever this object changes, as long as automation is enabled above.
      </p>
      {lastResult && <ScriptRunOutput result={lastResult} />}
    </div>
  );
}
