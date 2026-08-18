import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "../ui/Icon.js";

interface IOSMenuProps {
  open: boolean;
  onClose: () => void;
  align?: "start" | "end";
  /** "bottom" (default) opens below the trigger, growing downward - for top-bar menus. "top" opens above it, growing upward - for MobileBottomBar.tsx's menus, which have no room below them. */
  side?: "top" | "bottom";
  widthClassName?: string;
  children: React.ReactNode;
}

interface IOSMenuNavCtxValue {
  /** Which nested `IOSMenuSubmenu` (if any) is currently pushed on top of the root panel. */
  activePanel: string | null;
  setActivePanel: (id: string | null) => void;
  /** Portal target a submenu's content is rendered into - see IOSMenuSubmenu's doc comment for why. */
  portalNode: HTMLDivElement | null;
}
const IOSMenuNavContext = createContext<IOSMenuNavCtxValue | null>(null);

/**
 * Native-iOS-context-menu-styled dropdown shell - shared by MobileTopBar.tsx's
 * breadcrumb/"…" menus, MobileBottomBar.tsx's "new object"/"modules" pickers,
 * and WorkspaceLayout.tsx's desktop sidebar menus, so every dropdown in the
 * app looks and behaves the same: rounded, blurred, grouped by IOSMenuGroup
 * with thin dividers, scale+fade in from the trigger's corner.
 *
 * The backdrop is the *only* mechanism for "tap outside closes this,
 * without also activating whatever was under the tap" - it's a full-screen
 * element sitting in front of everything else while the menu is open, so
 * the browser delivers the tap to it, never to a link/button underneath.
 * A `useClickOutside`-style `pointerdown` listener (the previous approach
 * here) can't do that: it only reacts *after* the fact, so the element
 * underneath still gets its own click a moment later.
 */
export function IOSMenu({ open, onClose, align = "end", side = "bottom", widthClassName = "w-60", children }: IOSMenuProps) {
  const yOffset = side === "top" ? 4 : -4;
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null);
  // A submenu pushed open shouldn't still be showing the next time this same
  // trigger reopens the menu - reset to the root panel on every close.
  useEffect(() => {
    if (!open) setActivePanel(null);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: yOffset }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: yOffset }}
            transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
            style={{ transformOrigin: `${side === "top" ? "bottom" : "top"} ${align === "end" ? "right" : "left"}` }}
            className={`absolute z-50 ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"} ${align === "end" ? "right-0" : "left-0"} overflow-hidden rounded-2xl border border-border/60 bg-surface-raised/90 shadow-2xl backdrop-blur-xl`}
          >
            <IOSMenuNavContext.Provider value={{ activePanel, setActivePanel, portalNode }}>
              {/* CSS-grid stacking: the root panel and the active submenu's
                  portalled panel (if any) both sit in this same grid cell, so
                  the grid's auto row-track height - and with it this whole
                  menu, animated by `layout` - always matches whichever one is
                  actually showing, instead of staying pinned to the root
                  panel's size while a taller (or shorter) submenu is open. */}
              <motion.div layout="size" transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }} className={`grid ${widthClassName} overflow-y-auto`}>
                <div className="col-start-1 row-start-1">{children}</div>
                <div ref={setPortalNode} className="pointer-events-none col-start-1 row-start-1" />
              </motion.div>
            </IOSMenuNavContext.Provider>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** One visual group of rows, separated from the next by a thin divider - matches iOS context menus grouping related actions. */
export function IOSMenuGroup({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-border/60 py-1 last:border-b-0">{children}</div>;
}

interface IOSMenuItemProps {
  icon: string;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/** A single row - label left, icon right (native iOS context menu convention), min 44px tall tap target, `active:` press feedback instead of hover (which doesn't fire on touch). */
export function IOSMenuItem({ icon, label, onClick, destructive, disabled }: IOSMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[15px] disabled:opacity-40 ${
        destructive ? "text-red-500 active:bg-red-500/10" : "text-ink active:bg-surface"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Icon name={icon} className={`h-[18px] w-[18px] shrink-0 ${destructive ? "text-red-500" : "text-ink-muted"}`} />
    </button>
  );
}

interface IOSMenuSubmenuProps {
  /** Unique within this IOSMenu - identifies which panel is pushed open. */
  id: string;
  icon: string;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * A row that pushes a nested panel of its own `children` over the menu,
 * iOS-context-menu style, with a back row to return to the root.
 *
 * The panel itself is rendered through a portal into IOSMenu's `portalNode`
 * (a grid cell stacked directly on top of the root panel's cell) rather than
 * inline here - `IOSMenuSubmenu` is nested arbitrarily deep inside the root
 * panel's own content (e.g. within an `IOSMenuGroup`), so its natural DOM
 * position can't itself be a same-cell grid sibling of the root panel. The
 * portal is what lets the panel's real height (however many items *this*
 * submenu has) drive the shared grid cell's auto size, instead of being
 * boxed into a `position: absolute; inset: 0` that would just inherit
 * whatever height the root panel happens to have.
 */
export function IOSMenuSubmenu({ id, icon, label, disabled, children }: IOSMenuSubmenuProps) {
  const nav = useContext(IOSMenuNavContext);
  if (!nav) throw new Error("IOSMenuSubmenu must be rendered inside an IOSMenu");
  const isActive = nav.activePanel === id;

  return (
    <>
      <button
        onClick={() => nav.setActivePanel(id)}
        disabled={disabled}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[15px] text-ink disabled:opacity-40 active:bg-surface"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Icon name={icon} className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
      </button>
      {nav.portalNode &&
        createPortal(
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                className="pointer-events-auto min-h-full bg-surface-raised/95"
              >
                <button
                  onClick={() => nav.setActivePanel(null)}
                  className="flex min-h-11 w-full items-center gap-2 border-b border-border/60 px-3 py-2.5 text-left text-[15px] font-medium text-ink active:bg-surface"
                >
                  <Icon name="chevron-left" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                </button>
                {children}
              </motion.div>
            )}
          </AnimatePresence>,
          nav.portalNode,
        )}
    </>
  );
}
