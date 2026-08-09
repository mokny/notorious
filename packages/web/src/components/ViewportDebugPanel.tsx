import { useEffect, useState } from "react";

// TEMPORARY diagnostic panel for the iOS standalone-PWA bottom-gap
// investigation - shows the raw numbers instead of guessing from
// screenshots. Remove once the gap is diagnosed and fixed.
function getSafeAreaInset(side: "top" | "bottom"): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;${side}:0;height:env(safe-area-inset-${side});visibility:hidden;pointer-events:none;`;
  document.body.appendChild(probe);
  const value = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return value;
}

function readValues() {
  const vv = window.visualViewport;
  const main = document.querySelector("main");
  const nav = document.querySelector('nav[data-mobile-bottom-bar="true"]');
  const navRect = nav?.getBoundingClientRect();
  return {
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    screenHeight: window.screen.height,
    screenWidth: window.screen.width,
    vvHeight: vv?.height ?? null,
    vvOffsetTop: vv?.offsetTop ?? null,
    vvOffsetLeft: vv?.offsetLeft ?? null,
    dpr: window.devicePixelRatio,
    safeTop: getSafeAreaInset("top"),
    safeBottom: getSafeAreaInset("bottom"),
    mainScrollHeight: main?.scrollHeight ?? null,
    mainClientHeight: main?.clientHeight ?? null,
    mainScrollTop: main?.scrollTop ?? null,
    navTop: navRect?.top ?? null,
    navBottom: navRect?.bottom ?? null,
    docElClientHeight: document.documentElement.clientHeight,
    bodyClientHeight: document.body.clientHeight,
  };
}

export function ViewportDebugPanel() {
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState(readValues);

  useEffect(() => {
    const interval = setInterval(() => setValues(readValues()), 500);
    return () => clearInterval(interval);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed left-2 top-2 z-[9999] rounded bg-red-600 px-2 py-1 text-xs text-white"
        style={{ top: "calc(env(safe-area-inset-top) + 4px)" }}
      >
        vh-debug
      </button>
    );
  }

  return (
    <div
      className="fixed inset-x-2 z-[9999] max-h-[60vh] overflow-y-auto rounded bg-black/90 p-2 font-mono text-[10px] leading-tight text-lime-300"
      style={{ top: "calc(env(safe-area-inset-top) + 4px)" }}
    >
      <button onClick={() => setOpen(false)} className="mb-1 rounded bg-red-600 px-2 py-0.5 text-white">
        close
      </button>
      {Object.entries(values).map(([k, v]) => (
        <div key={k}>
          {k}: {String(v)}
        </div>
      ))}
    </div>
  );
}
