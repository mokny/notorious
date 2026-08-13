import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      // Fixed offset from the viewport (not WorkspaceLayout.tsx's
      // `--sticky-toolbar-top`) - this is portaled straight to `document.body`,
      // outside the DOM subtree that CSS custom property is set on, so it
      // wouldn't inherit it anyway. `env(safe-area-inset-top)` alone still
      // clears the iOS status bar/notch; the added 56px clears the mobile
      // header bar underneath it (see WorkspaceLayout.tsx's
      // `MOBILE_HEADER_HEIGHT`) so this never sits over either.
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-ink px-2 py-1.5 text-sm text-surface shadow-xl [@media(pointer:coarse)]:gap-1.5 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2 [@media(pointer:coarse)]:text-base">
        <span className="px-2 tabular-nums">{t("editor.search.matchCount", { current, total })}</span>
        <button
          type="button"
          onClick={onPrev}
          title={t("editor.search.previousMatch")}
          className="rounded p-1 hover:bg-surface/10 [@media(pointer:coarse)]:p-2.5"
        >
          <Icon name="chevron-up" className="h-4 w-4 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          title={t("editor.search.nextMatch")}
          className="rounded p-1 hover:bg-surface/10 [@media(pointer:coarse)]:p-2.5"
        >
          <Icon name="chevron-down" className="h-4 w-4 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title={t("editor.search.close")}
          className="rounded p-1 hover:bg-surface/10 [@media(pointer:coarse)]:p-2.5"
        >
          <Icon name="close" className="h-4 w-4 [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
