import { useState } from "react";
import { expectedHeight, healViewport, nudgeScrollableAncestors, publishAppVh } from "../hooks/useDynamicViewportHeight.js";

// TEMPORARY - none of the automatic fixes (reload, re-add-to-homescreen,
// display-toggle heal, programmatic scroll nudge) have closed the gap below
// the bottom tab bar on a real device, even though the user reports that a
// real manual scroll gesture fixes it instantly. This panel isolates *which*
// mechanism (if any) actually does anything when fired from a real tap
// (a genuine user gesture), instead of guessing blind again. Remove once
// diagnosed.
export function ViewportDebugPanel() {
  const [log, setLog] = useState<string[]>([]);

  function measure(label: string) {
    const line = `${label}: innerH=${window.innerHeight} expected=${expectedHeight()} gap=${expectedHeight() - window.innerHeight}`;
    setLog((prev) => [...prev.slice(-6), line]);
  }

  return (
    <div className="fixed left-1 top-1/2 z-[200] flex max-w-[95vw] -translate-y-1/2 flex-col gap-1 rounded bg-red-600 p-2 font-mono text-[10px] text-white">
      <div className="flex gap-1">
        <button
          className="rounded bg-white/20 px-2 py-1"
          onClick={() => {
            measure("before heal");
            const ran = healViewport();
            measure(`after heal (ran=${ran})`);
          }}
        >
          Heal
        </button>
        <button
          className="rounded bg-white/20 px-2 py-1"
          onClick={() => {
            measure("before nudge");
            nudgeScrollableAncestors();
            requestAnimationFrame(() => measure("after nudge"));
          }}
        >
          Nudge
        </button>
        <button
          className="rounded bg-white/20 px-2 py-1"
          onClick={() => {
            publishAppVh();
            measure("manual measure");
          }}
        >
          Measure
        </button>
        <button className="rounded bg-white/20 px-2 py-1" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
      {log.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
