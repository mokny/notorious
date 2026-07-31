import { useState, type ReactNode } from "react";
import { Icon } from "./Icon.js";

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  /** Extra header controls (e.g. an "add" button) - kept as a sibling of the toggle, not nested inside it, since a `<button>` can't contain another `<button>`. */
  actions?: ReactNode;
  children: ReactNode;
}

/** The "Sub-objects"/"Linked from" style bottom-of-object sections: collapsed by default so a long list of relations doesn't dominate the page before anyone's asked to see it. */
export function CollapsibleSection({ title, defaultExpanded = false, actions, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="mt-10 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
          {title}
        </button>
        {actions}
      </div>
      {expanded && children}
    </div>
  );
}
