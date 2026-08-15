import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
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
/** Shared marker for every panel in a menu tree (the root list and any open submenu, each its own portal - see ContextMenuRow) - lets the outside-click check below treat the whole tree as one thing instead of each portal only knowing about itself. */
const PANEL_ATTR = "data-context-menu-panel";

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

/**
 * Closes on a pointerdown outside *every* currently-open panel in this menu
 * tree, not just this specific one - a submenu is its own separate portal
 * (see ContextMenuRow below), so a plain per-ref `useClickOutside` on the
 * root list saw a click landing inside the submenu's portal as "outside"
 * and closed the whole tree before the click's own `onClick` (which fires
 * after `pointerdown`) ever ran, silently eating every submenu selection.
 * Checking against every `[data-context-menu-panel]` in the document - not
 * just this instance's own ref - fixes that regardless of which panel in
 * the tree the click actually landed in.
 */
function useCloseOnOutsidePointerDown(onClose: () => void): void {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      const panels = document.querySelectorAll(`[${PANEL_ATTR}]`);
      for (const panel of panels) {
        if (panel.contains(target)) return;
      }
      onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuEntry[]; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(containerRef, x, y);
  useCloseOnOutsidePointerDown(onClose);

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
      {...{ [PANEL_ATTR]: true }}
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
          // The whole tree shares one `onCloseAll` (ultimately this
          // ContextMenu's own `onClose` prop, threaded down unchanged
          // through every nesting level) - selecting a leaf item anywhere in
          // a submenu closes the entire menu, not just that one submenu
          // panel, matching how a native context menu's submenu behaves.
          <ContextMenuRow key={item.key} item={item} onCloseAll={onClose} />
        ),
      )}
    </div>,
    document.body,
  );
}

function ContextMenuRow({ item, onCloseAll }: { item: ContextMenuItem; onCloseAll: () => void }) {
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
    onCloseAll();
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
        <ContextMenu x={submenuPos.x} y={submenuPos.y} items={item.submenu} onClose={onCloseAll} />
      )}
    </>
  );
}
