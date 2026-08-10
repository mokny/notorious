import { NavLink } from "react-router-dom";

export interface TabItem {
  key: string;
  label: string;
  to: string;
}

/**
 * Horizontally-scrollable pill/segmented-control tab bar (iOS-style), used
 * to switch between sub-routes rendered via the parent's own `<Outlet/>`.
 * Same markup on every breakpoint - see the settings pages that use this.
 */
export function Tabs({ items }: { items: TabItem[] }) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
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
  );
}
