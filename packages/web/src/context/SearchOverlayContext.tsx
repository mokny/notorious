import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

interface SearchOverlayValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** The search sheet's `<input>` - always mounted (see SearchSheet.tsx's own comment on why), so `open()` can call `.focus()` on it synchronously within the same click/tap handler that triggered it. That's required for iOS Safari/PWA to actually pop the on-screen keyboard: it only honors a programmatic `focus()` when the call is still inside the original user-gesture's synchronous call stack - a `setTimeout` or a focus fired after the input mounts on a later render both lose that, landing the cursor in the field but *not* opening the keyboard. */
  inputRef: RefObject<HTMLInputElement>;
}

const SearchOverlayContext = createContext<SearchOverlayValue | null>(null);

/**
 * Open/closed state for the mobile slide-up search sheet (SearchSheet.tsx) -
 * a plain boolean in a context (not a route) so any phone-breakpoint UI
 * (MobileBottomBar's search icon, a future keyboard shortcut, ...) can
 * trigger it without needing to be a descendant of the sheet itself. Search
 * still keeps its `/search` route for desktop/tablet (SearchPage.tsx) - this
 * is purely the mobile overlay's own state.
 */
export function SearchOverlayProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = useCallback(() => {
    setIsOpen(true);
    // See `inputRef`'s own doc comment above - has to happen right here,
    // synchronously, not in an effect/timeout reacting to `isOpen` flipping.
    inputRef.current?.focus();
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    // Otherwise the keyboard stays up (the input still has focus) even
    // though the sheet has just slid away underneath it.
    inputRef.current?.blur();
  }, []);
  const value = useMemo(() => ({ isOpen, open, close, inputRef }), [isOpen, open, close]);
  return <SearchOverlayContext.Provider value={value}>{children}</SearchOverlayContext.Provider>;
}

export function useSearchOverlay(): SearchOverlayValue {
  const ctx = useContext(SearchOverlayContext);
  if (!ctx) throw new Error("useSearchOverlay must be used within a SearchOverlayProvider");
  return ctx;
}
