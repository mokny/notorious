import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

const BASE_FONT_SIZE = 16;

interface UseFitTextOptions {
  text: string;
  /** Anything that changes how wide `text` renders at a given font-size - passed through to the recompute effect's deps, alongside `text` itself. */
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  minFontSize?: number;
  maxFontSize?: number;
}

/**
 * Sizes `text` so it spans exactly the width of a container element on one
 * line - renders it once into a hidden, unconstrained measuring span at a
 * fixed baseline size, then scales the font-size by the ratio of the
 * container's actual width to that measured width. Recomputed on container
 * resize and whenever anything affecting character width changes.
 *
 * `containerRef` is a *callback* ref (not a plain `RefObject`) deliberately:
 * a plain ref's value isn't part of a dependency array, so if the container
 * only starts existing later (e.g. it's behind a conditional render - like
 * "only once a cover image is set" here), an effect keyed on `[text, ...]`
 * alone would never notice the ref went from null to an element, since none
 * of those values necessarily change at that moment. Backing it with state
 * makes the container's *existence* itself a dependency.
 *
 * Attach `measureRef` to a `position: absolute; visibility: hidden;
 * white-space: nowrap` span containing the same text, styled with the same
 * font-family/weight/style/transform (but NOT the computed font-size - it
 * always measures at `BASE_FONT_SIZE`, only the ratio matters).
 */
export function useFitText({
  text,
  fontFamily,
  bold,
  italic,
  uppercase,
  minFontSize = 20,
  maxFontSize = 140,
}: UseFitTextOptions): {
  fontSize: number;
  measureRef: RefObject<HTMLSpanElement>;
  containerRef: (node: HTMLElement | null) => void;
} {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((node: HTMLElement | null) => setContainer(node), []);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(minFontSize);

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!container || !measure) return;

    function recompute(): void {
      const containerWidth = container!.clientWidth;
      const measuredWidth = measure!.getBoundingClientRect().width;
      if (containerWidth <= 0 || measuredWidth <= 0) return;
      const next = Math.min(maxFontSize, Math.max(minFontSize, (containerWidth / measuredWidth) * BASE_FONT_SIZE));
      setFontSize(next);
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, text, fontFamily, bold, italic, uppercase, minFontSize, maxFontSize]);

  return { fontSize, measureRef, containerRef };
}
