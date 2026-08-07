import { useEffect, useState } from "react";

// TEMPORARY - diagnosing a persistent gap between the bottom tab bar and the
// real screen edge on an installed iOS standalone PWA that survives a full
// reload AND a from-scratch re-add-to-homescreen (both already ruled out as
// the cause). This renders a lime `position: fixed; inset: 0` rectangle with
// a 1px red border - if that rectangle's own edges don't touch the physical
// screen edges either, no page-level CSS/JS can be the culprit at all; it'd
// mean WKWebView's own frame, as hosted by iOS for this standalone PWA, is
// smaller than the physical screen and nothing in the page can reach past
// it. Remove once diagnosed.
export function DebugFixedOverlay() {
  const [info, setInfo] = useState("");
  useEffect(() => {
    function update() {
      const probeBottom = document.createElement("div");
      probeBottom.style.cssText = "position:fixed;bottom:0;height:env(safe-area-inset-bottom);visibility:hidden;";
      document.body.appendChild(probeBottom);
      const sab = probeBottom.getBoundingClientRect().height;
      document.body.removeChild(probeBottom);

      const probeTop = document.createElement("div");
      probeTop.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden;";
      document.body.appendChild(probeTop);
      const sat = probeTop.getBoundingClientRect().height;
      document.body.removeChild(probeTop);

      setInfo(
        [
          `innerH=${window.innerHeight}`,
          `screenH=${window.screen.height}`,
          `screenAvailH=${window.screen.availHeight}`,
          `visualVP=${Math.round(window.visualViewport?.height ?? -1)}`,
          `visualVPoffTop=${Math.round(window.visualViewport?.offsetTop ?? -1)}`,
          `dpr=${window.devicePixelRatio}`,
          `sat=${sat}`,
          `sab=${sab}`,
          `htmlH=${document.documentElement.getBoundingClientRect().height}`,
          `bodyH=${document.body.getBoundingClientRect().height}`,
        ].join(" "),
      );
    }
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-[200] border-4 border-red-600 bg-lime-400/40" />
      <div className="pointer-events-none fixed left-1 top-1/2 z-[201] max-w-[95vw] -translate-y-1/2 break-words rounded bg-red-600 p-2 font-mono text-[10px] text-white">
        {info}
      </div>
    </>
  );
}
