import { useEffect, type RefObject } from "react";

/** Calls `onOutside` when a pointer-down lands outside the given element - the standard "close this dropdown/menu when you click elsewhere" pattern. */
export function useClickOutside<T extends HTMLElement>(ref: RefObject<T | null>, onOutside: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(event: PointerEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [ref, onOutside, enabled]);
}
