import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface SearchOverlayValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const SearchOverlayContext = createContext<SearchOverlayValue | null>(null);

/**
 * Open/closed state for the mobile slide-up search sheet (SearchSheet.tsx) -
 * a plain boolean in a context (not a route) so any phone-breakpoint UI
 * (MobileBottomBar's search icon, a future keyboard shortcut, ...) can
 * trigger it without needing to be a descendant of the sheet itself. Search
 * still keeps its `/search` route for desktop/tablet (SearchPage.tsx) - this
 * is purely the mobile overlay's own state.
 *
 * Deliberately doesn't try to auto-focus the search input on open anymore -
 * an earlier version did (via a shared inputRef here, focused synchronously
 * inside `open()` to satisfy iOS's "must be in the same user-gesture call
 * stack" rule for programmatically opening the keyboard), but even with
 * that in place the sheet still ended up pushed off-screen on a real
 * device, and simplifying back down to "the user taps the field like any
 * other input" was more reliable than continuing to chase the exact cause.
 */
export function SearchOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <SearchOverlayContext.Provider value={value}>{children}</SearchOverlayContext.Provider>;
}

export function useSearchOverlay(): SearchOverlayValue {
  const ctx = useContext(SearchOverlayContext);
  if (!ctx) throw new Error("useSearchOverlay must be used within a SearchOverlayProvider");
  return ctx;
}
