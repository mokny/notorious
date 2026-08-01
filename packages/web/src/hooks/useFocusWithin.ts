import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether focus is anywhere inside the element these handlers are
 * spread onto - the JS equivalent of CSS `:focus-within`, needed when hiding
 * something has to mean "not in the layout at all" rather than just
 * `invisible` (which keeps its box, and everything after it indented to
 * make room for a control nobody can see).
 *
 * Hiding is driven by a document-level `pointerdown` outside the container
 * (the same reliable pattern `useClickOutside.ts` uses), not by the child's
 * own native `blur`/`focusout` event - a templatable field (see
 * TemplatableMarkdown.tsx) swaps its focused, editable element out for a
 * different one on every edit/render transition, and that swap was
 * empirically observed to make a *later* click elsewhere fail to fire a
 * `focusout` on the old element at all (a browser quirk around focus
 * bookkeeping across several remounts of the same screen position, not
 * something fixable from here) - leaving `isFocused` stuck `true` forever.
 * The deferred `blur` check remains as a fallback for keyboard-driven focus
 * changes (e.g. Tab), which don't go through `pointerdown` at all.
 */
export function useFocusWithin<T extends HTMLElement = HTMLElement>() {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!isFocused) return;
    function handlePointerDown(event: PointerEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsFocused(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isFocused]);

  return {
    isFocused,
    containerRef,
    handlers: {
      onFocus: () => setIsFocused(true),
      onBlur: () => {
        setTimeout(() => {
          if (!containerRef.current?.contains(document.activeElement)) setIsFocused(false);
        }, 0);
      },
    },
  };
}
