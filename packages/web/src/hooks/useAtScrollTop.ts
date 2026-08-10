import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Tracks whether the most recently scrolled descendant of the returned ref
 * is at its own scroll top - used to gate a sheet's drag-to-dismiss gesture
 * (ChatSheet, SearchSheet) so a downward swipe only starts closing the sheet
 * once its content has nothing left to scroll up into, instead of fighting
 * the content's own scroll on every drag. Listens on the capture phase since
 * `scroll` events don't bubble - the only way to observe scrolling in a
 * nested container without that container exposing its own ref (ChatPanel
 * renders either ConversationList or ThreadView, each independently
 * scrolling, without ChatSheet ever seeing which).
 */
export function useAtScrollTop<T extends HTMLElement>(resetKey: unknown): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    setAtTop(true);
  }, [resetKey]);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    function handleScroll(event: Event) {
      setAtTop((event.target as HTMLElement).scrollTop <= 0);
    }

    container.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => container.removeEventListener("scroll", handleScroll, true);
  }, []);

  return [ref, atTop];
}
