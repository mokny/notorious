import { useEffect, type RefObject } from "react";

/**
 * Calls `onOutside` when a pointer-down lands outside the given element -
 * the standard "close this dropdown/menu when you click elsewhere" pattern.
 * `extraRefs` covers a *portaled* popover (see BlockSlugButton.tsx/
 * ObjectSlugButton.tsx, which portal into `document.body` via
 * `useAnchoredPosition.ts`) - it lives outside `ref`'s own DOM subtree even
 * though it's logically still "inside" this widget, so a click landing on it
 * would otherwise be misread as a click elsewhere and close it immediately.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onOutside: () => void,
  enabled = true,
  extraRefs: RefObject<HTMLElement | null>[] = [],
): void {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      if (extraRefs.some((extraRef) => extraRef.current?.contains(target))) return;
      onOutside();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, onOutside, enabled]);
}
