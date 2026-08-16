import { useLayoutEffect, useState } from "react";
import { withShareToken } from "../lib/api/shareMode.js";

interface CompanyBannerProps {
  companyName: string | null;
  companyCover: string | null;
  companyBannerHeight: number;
  companyBannerTextColor: string | null;
  companyBannerBackgroundColor: string | null;
  companyBannerBold: boolean;
  companyBannerItalic: boolean;
  companyBannerLetterSpacing: boolean;
  companyBannerTextAlign: "left" | "center" | "right";
}

// Same left/right fade-to-transparent idiom as Tabs.tsx's scrollable-edge
// mask, applied unconditionally here (the banner always fades, not just when
// content overflows).
const FADE_MASK = "linear-gradient(to right, transparent, black 12%, black 88%, transparent)";

/**
 * Optional owner-set branding banner shown on object detail pages (see
 * ObjectDetailPage.tsx) - directly below the object's own cover if it has
 * one, or as the very first element if it doesn't. Renders nothing if the
 * workspace has neither companyName nor companyCover set. When companyCover
 * is set it wins outright (plain image, no text); otherwise companyName
 * renders as text over companyBannerBackgroundColor.
 */
export function CompanyBanner({
  companyName,
  companyCover,
  companyBannerHeight,
  companyBannerTextColor,
  companyBannerBackgroundColor,
  companyBannerBold,
  companyBannerItalic,
  companyBannerLetterSpacing,
  companyBannerTextAlign,
}: CompanyBannerProps) {
  const letterSpacing = useFillWidthLetterSpacing(companyBannerLetterSpacing ? companyName : null);

  if (!companyCover && !companyName) return null;

  if (companyCover) {
    return (
      <div className="w-full" style={{ height: companyBannerHeight, maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}>
        <img src={withShareToken(companyCover)} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className="flex w-full items-center px-6"
      style={{
        height: companyBannerHeight,
        backgroundColor: companyBannerBackgroundColor ?? "rgb(var(--surface-raised))",
        justifyContent: companyBannerTextAlign === "left" ? "flex-start" : companyBannerTextAlign === "right" ? "flex-end" : "center",
        maskImage: FADE_MASK,
        WebkitMaskImage: FADE_MASK,
      }}
    >
      <span
        ref={letterSpacing.measureRef}
        className="truncate"
        style={{
          color: companyBannerTextColor ?? undefined,
          fontWeight: companyBannerBold ? 700 : 400,
          fontStyle: companyBannerItalic ? "italic" : "normal",
          letterSpacing: letterSpacing.value,
        }}
      >
        {companyName}
      </span>
    </div>
  );
}

// Target fraction of the available (padding-excluded) width the text should
// stretch to - not the full 100%, so it doesn't hug the fade edges.
const FILL_WIDTH_FRACTION = 0.8;

// Lazily-created, module-singleton offscreen element used to measure text
// width without ever touching the visible node's style (see below).
let sharedMeasurer: HTMLSpanElement | null = null;
function getSharedMeasurer(): HTMLSpanElement {
  if (!sharedMeasurer) {
    sharedMeasurer = document.createElement("span");
    sharedMeasurer.style.position = "absolute";
    sharedMeasurer.style.visibility = "hidden";
    sharedMeasurer.style.whiteSpace = "nowrap";
    sharedMeasurer.style.pointerEvents = "none";
    sharedMeasurer.style.left = "-9999px";
    sharedMeasurer.style.top = "0";
    document.body.appendChild(sharedMeasurer);
  }
  return sharedMeasurer;
}

/**
 * Computes a `letter-spacing` value that stretches `text` to roughly fill
 * FILL_WIDTH_FRACTION of its container's width, re-measured on resize - same
 * "measure at natural width, scale against the container" approach as
 * useFitText.ts, but solving for letter-spacing instead of font-size. `null`
 * (the toggle off, or no text) skips all measurement and returns undefined.
 *
 * Measures via a detached, invisible clone rather than the visible span
 * itself - toggling the live element's letter-spacing to 0 to measure it
 * caused a visible flash back to normal spacing on every resize, and left
 * spacing stuck at 0 whenever a measurement briefly came out invalid (e.g.
 * before layout/fonts settled on first mount) since React never re-touches
 * a style property that was already undefined in its previous render.
 */
function useFillWidthLetterSpacing(text: string | null): {
  measureRef: (node: HTMLSpanElement | null) => void;
  value: number | undefined;
} {
  const [container, setContainer] = useState<HTMLSpanElement | null>(null);
  const [value, setValue] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!text || !container) {
      setValue(undefined);
      return;
    }
    const parent = container.parentElement;
    if (!parent) return;

    function recompute(): void {
      if (!text || !container || !parent) return;
      const measurer = getSharedMeasurer();
      const containerStyle = getComputedStyle(container);
      measurer.style.fontFamily = containerStyle.fontFamily;
      measurer.style.fontSize = containerStyle.fontSize;
      measurer.style.fontWeight = containerStyle.fontWeight;
      measurer.style.fontStyle = containerStyle.fontStyle;
      measurer.style.letterSpacing = "0px";
      measurer.textContent = text;
      const naturalWidth = measurer.getBoundingClientRect().width;

      const parentStyle = getComputedStyle(parent);
      const horizontalPadding = parseFloat(parentStyle.paddingLeft) + parseFloat(parentStyle.paddingRight);
      const availableWidth = (parent.clientWidth - horizontalPadding) * FILL_WIDTH_FRACTION;
      if (availableWidth <= 0 || naturalWidth <= 0 || text.length < 2) {
        setValue(undefined);
        return;
      }
      // Divide by the full character count, not length-1: browsers apply
      // letter-spacing after every character including the last one, so the
      // rendered width is naturalWidth + extra * text.length, not
      // naturalWidth + extra * (text.length - 1).
      const extra = (availableWidth - naturalWidth) / text.length;
      setValue(extra > 0 ? extra : undefined);
    }

    recompute();
    // Fonts loading async can make the first measurement use fallback-font
    // metrics, undershooting the target width until something else (e.g. a
    // resize) forces a remeasure - so also recompute once webfonts are ready.
    void document.fonts?.ready?.then(recompute);
    const observer = new ResizeObserver(recompute);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [text, container]);

  return { measureRef: setContainer, value };
}
