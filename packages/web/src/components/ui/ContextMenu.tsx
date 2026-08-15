import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "../../hooks/useClickOutside.js";
import { Icon } from "./Icon.js";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuItem[];
}

export type ContextMenuEntry = ContextMenuItem | { key: string; separator: true };

const VIEWPORT_MARGIN = 8;

/**
 * Shift held down at trigger time is the universal browser convention for
 * "give me the native context menu anyway" (VS Code Web, Notion, ...) - every
 * `onContextMenu` handler that opens one of these custom menus checks this
 * first and, if true, does nothing (leaving `preventDefault` uncalled) so the
 * browser's own menu shows instead.
 */
export function isNativeMenuOverride(event: { shiftKey: boolean }): boolean {
  return event.shiftKey;
}

/** Clamps a panel already in the DOM at `(x, y)` back inside the viewport once its size is known - same nudge-after-measure approach as useKeepInViewport.ts, but returning absolute coordinates instead of a transform since this positions a `position: fixed` element from scratch rather than correcting an existing anchored one. Exported for BlockContextMenu.tsx, whose own panel (a stateful slug-editing sub-form, not a plain item list) can't be built from this file's generic `items` prop but still anchors the same way. */
export function useClampedPosition(ref: React.RefObject<HTMLElement | null>, x: number, y: number) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) left = Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - rect.width);
    if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) top = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - rect.height);
    setPos({ left, top });
  }, [ref, x, y]);

  return pos;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuEntry[]; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(containerRef, x, y);
  useClickOutside(containerRef, onClose, true);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div
      ref={containerRef}
      role="menu"
      className="fixed z-[100] max-h-[70vh] min-w-[200px] overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? "visible" : "hidden" }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) =>
        "separator" in item ? (
          <div key={item.key} className="my-1 h-px bg-border" />
        ) : (
          <ContextMenuRow key={item.key} item={item} onDone={onClose} />
        ),
      )}
    </div>,
    document.body,
  );
}

function ContextMenuRow({ item, onDone }: { item: ContextMenuItem; onDone: () => void }) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);

  function openSubmenu() {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSubmenuPos({ x: rect.right, y: rect.top });
    setSubmenuOpen(true);
  }

  function handleClick(event: ReactMouseEvent) {
    event.stopPropagation();
    if (item.disabled) return;
    if (item.submenu) {
      if (submenuOpen) setSubmenuOpen(false);
      else openSubmenu();
      return;
    }
    item.onSelect?.();
    onDone();
  }

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onClick={handleClick}
        onMouseEnter={item.submenu ? openSubmenu : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
          item.danger ? "text-red-500 hover:bg-red-500/10" : "text-ink hover:bg-surface"
        }`}
      >
        {item.icon && <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0" />}
        <span className="flex-1 truncate">{item.label}</span>
        {item.submenu && <Icon name="chevron-right" className="h-3.5 w-3.5 shrink-0 text-ink-muted" />}
      </button>
      {item.submenu && submenuOpen && submenuPos && (
        <ContextMenu x={submenuPos.x} y={submenuPos.y} items={item.submenu} onClose={() => setSubmenuOpen(false)} />
      )}
    </>
  );
}
