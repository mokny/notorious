import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Icon } from "./Icon.js";

export interface TabItem {
  key: string;
  label: string;
  to: string;
}

const SCROLL_STEP_PX = 150;

/**
 * Horizontally-scrollable pill/segmented-control tab bar (iOS-style), used
 * to switch between sub-routes rendered via the parent's own `<Outlet/>`.
 * Same markup on every breakpoint - see the settings pages that use this.
 * Fade + chevron scroll buttons appear only once the pills actually overflow
 * the available width, and only for mouse/trackpad users - touch keeps plain
 * swipe-scrolling.
 */
export function Tabs({ items }: { items: TabItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isFinePointer] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setOverflowing(el.scrollWidth > el.clientWidth + 1);
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    };

    update();
    el.addEventListener("scroll", update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, [items]);

  const scrollBy = (delta: number) => scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });

  const showArrows = overflowing && isFinePointer;

  return (
    <div className="flex items-center gap-1">
      {showArrows && (
        <button
          type="button"
          onClick={() => scrollBy(-SCROLL_STEP_PX)}
          disabled={!canScrollLeft}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40"
          aria-label="Scroll tabs left"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
        </button>
      )}
      <div className="relative min-w-0 flex-1">
        {overflowing && canScrollLeft && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-surface to-transparent" />
        )}
        <div
          ref={scrollRef}
          className="scrollbar-hide -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
        >
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end
              className={({ isActive }) =>
                `shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-accent text-white" : "bg-surface-raised text-ink-muted hover:bg-surface hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        {overflowing && canScrollRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-surface to-transparent" />
        )}
      </div>
      {showArrows && (
        <button
          type="button"
          onClick={() => scrollBy(SCROLL_STEP_PX)}
          disabled={!canScrollRight}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised hover:text-ink disabled:opacity-40"
          aria-label="Scroll tabs right"
        >
          <Icon name="chevron-right" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
