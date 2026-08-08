import { useState, type ReactNode } from "react";
import { Icon } from "./Icon.js";

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  /** Skips the section's own chevron toggle and always renders its content expanded - used when an ancestor (e.g. ObjectDetailPage.tsx's master show/hide toggle) already gates whether this section appears at all, so a second, nested click-to-expand would be redundant. */
  forceExpanded?: boolean;
  /** Extra header controls (e.g. an "add" button) - kept as a sibling of the toggle, not nested inside it, since a `<button>` can't contain another `<button>`. */
  actions?: ReactNode;
  children: ReactNode;
}

/** The "Sub-objects"/"Linked from" style bottom-of-object sections: collapsed by default so a long list of relations doesn't dominate the page before anyone's asked to see it. */
export function CollapsibleSection({ title, defaultExpanded = false, forceExpanded = false, actions, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isExpanded = forceExpanded || expanded;

  return (
    <div className="mt-10 border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        {forceExpanded ? (
          <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{title}</span>
        ) : (
          <button
            onClick={() => setExpanded((v) => !v)}
            // Expanding/collapsing is a view action, not an edit - exempted
            // from ObjectDetailPage.tsx's READ_ONLY_LOCK (which otherwise
            // disables every `<button>` in a locked/read-only object) so it
            // keeps working there.
            data-view-toggle
            className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
          >
            <Icon name={isExpanded ? "chevron-down" : "chevron-right"} className="h-3.5 w-3.5" />
            {title}
          </button>
        )}
        {actions}
      </div>
      {isExpanded && children}
    </div>
  );
}
