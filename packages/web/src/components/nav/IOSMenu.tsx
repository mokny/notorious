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

/**
 * Native-iOS-context-menu-styled dropdown shell, phone only - shared by
 * MobileTopBar.tsx's breadcrumb/"…" menus and MobileBottomBar.tsx's "new
 * object" picker, so every phone dropdown looks and behaves the same:
 * rounded, blurred, grouped by IOSMenuGroup with thin dividers, scale+fade
 * in from the trigger's corner.
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
            className={`absolute z-50 ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"} ${align === "end" ? "right-0" : "left-0"} ${widthClassName} overflow-hidden rounded-2xl border border-border/60 bg-surface-raised/90 shadow-2xl backdrop-blur-xl`}
          >
            {children}
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
