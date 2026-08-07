import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon.js";

interface SearchMatchToolbarProps {
  /** 1-based, matches `current` of `total`. */
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Fixed-position "N of M" navigator shown after clicking a search result
 * (see SearchPage.tsx's `?highlight=` param and BlockEditor.tsx's match
 * scanning) - browser-find-style prev/next between every occurrence of the
 * searched words across this object's blocks, plus a close button that
 * drops the `?highlight=` param (see ObjectDetailPage.tsx).
 *
 * Portaled straight to `document.body` rather than rendered in place -
 * ObjectDetailPage.tsx wraps BlockEditor in a `locked-content` class while
 * the object is locked (or read-only for a share viewer), which disables
 * `pointer-events` on every descendant button with no exemption for this
 * one. This toolbar has to stay usable regardless (it's read-only
 * navigation, not an edit), so it needs to sit structurally outside that
 * wrapper's DOM subtree instead of just visually on top of it via `fixed`
 * positioning, which alone doesn't escape an ancestor's `pointer-events:
 * none`.
 */
export function SearchMatchToolbar({ current, total, onPrev, onNext, onClose }: SearchMatchToolbarProps) {
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-ink px-2 py-1.5 text-sm text-surface shadow-xl">
        <span className="px-2 tabular-nums">
          {current} of {total}
        </span>
        <button type="button" onClick={onPrev} title="Previous match" className="rounded p-1 hover:bg-surface/10">
          <Icon name="chevron-up" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onNext} title="Next match" className="rounded p-1 hover:bg-surface/10">
          <Icon name="chevron-down" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} title="Close" className="rounded p-1 hover:bg-surface/10">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
