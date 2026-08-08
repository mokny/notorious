import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ObjectHistoryEntry {
  id: string;
  title: string;
  icon: string | null;
}

interface ObjectHistoryValue {
  /** Most recent last; the last entry is whatever object is currently open. */
  entries: ObjectHistoryEntry[];
  current: ObjectHistoryEntry | null;
  /** Records/updates the currently open object at the top of the stack. */
  visit: (entry: ObjectHistoryEntry) => void;
  /** Pops the current entry and returns the id to navigate back to, or null if there's nowhere to go back to. */
  goBack: () => string | null;
  /** Truncates the stack so `id` becomes the current (top) entry - used when jumping to an entry from the breadcrumb list. */
  jumpTo: (id: string) => void;
}

const ObjectHistoryContext = createContext<ObjectHistoryValue | null>(null);

// Capped so a long session browsing many objects doesn't grow this unbounded
// - only the breadcrumb dropdown and the back button need this, neither of
// which benefits from more than a couple dozen entries of scrollback.
const MAX_ENTRIES = 30;

/**
 * Mobile-only "back to the previous object" stack (see the floating top
 * pill header, MobileTopBar.tsx) - the app otherwise has no concept of
 * object-to-object navigation history (plain react-router `navigate()`
 * everywhere), so this is deliberately its own lightweight context rather
 * than reusing browser history, which breaks across deep-links/refreshes.
 * Wraps WorkspaceLayoutInner (below the route's Outlet), so it resets
 * fresh on every full page load - not persisted across sessions.
 */
export function ObjectHistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ObjectHistoryEntry[]>([]);
  // Mirrors `entries` synchronously for goBack/jumpTo, which need to read
  // and return the post-update state in the same call (setState's updater
  // return value isn't available to the caller).
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const visit = useCallback((entry: ObjectHistoryEntry) => {
    setEntries((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.id === entry.id) {
        // Same object re-visited (e.g. title/icon changed) - update in place
        // rather than pushing a duplicate entry.
        if (top.title === entry.title && top.icon === entry.icon) return prev;
        return [...prev.slice(0, -1), entry];
      }
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  }, []);

  const goBack = useCallback((): string | null => {
    const prev = entriesRef.current;
    if (prev.length < 2) return null;
    const next = prev.slice(0, -1);
    entriesRef.current = next;
    setEntries(next);
    return next[next.length - 1]!.id;
  }, []);

  const jumpTo = useCallback((id: string) => {
    const prev = entriesRef.current;
    const index = prev.findIndex((e) => e.id === id);
    if (index === -1) return;
    const next = prev.slice(0, index + 1);
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const value = useMemo<ObjectHistoryValue>(
    () => ({ entries, current: entries[entries.length - 1] ?? null, visit, goBack, jumpTo }),
    [entries, visit, goBack, jumpTo],
  );

  return <ObjectHistoryContext.Provider value={value}>{children}</ObjectHistoryContext.Provider>;
}

// Falls back to a harmless no-op stack outside the provider (e.g. the
// standalone share-link route tree, which doesn't render WorkspaceLayout) so
// ObjectDetailPage can call this unconditionally without checking which tree
// it's mounted under.
const NOOP_VALUE: ObjectHistoryValue = {
  entries: [],
  current: null,
  visit: () => {},
  goBack: () => null,
  jumpTo: () => {},
};

export function useObjectHistory(): ObjectHistoryValue {
  return useContext(ObjectHistoryContext) ?? NOOP_VALUE;
}
