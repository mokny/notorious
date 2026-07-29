import { useCallback, useEffect, useState } from "react";

/**
 * Fired whenever any `useLocalStorageState` instance writes a key, so every
 * other instance watching that same key (e.g. the pin button on the object
 * page and the pinned list in the sidebar - separate components, not
 * parent/child) re-reads and re-renders immediately. The browser's native
 * `storage` event only fires in *other* tabs/windows, never same-document.
 */
const LOCAL_CHANGE_EVENT = "notorious:local-storage-change";

function readValue<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Generic localStorage-backed state - used for pins, recents, and remembered collapse state. */
export function useLocalStorageState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readValue(key, defaultValue));

  useEffect(() => {
    setState(readValue(key, defaultValue));

    function handleLocalChange(event: Event): void {
      if ((event as CustomEvent<string>).detail === key) setState(readValue(key, defaultValue));
    }
    function handleStorageChange(event: StorageEvent): void {
      if (event.key === key) setState(readValue(key, defaultValue));
    }
    window.addEventListener(LOCAL_CHANGE_EVENT, handleLocalChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(LOCAL_CHANGE_EVENT, handleLocalChange);
      window.removeEventListener("storage", handleStorageChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setAndPersist = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // localStorage can throw in private-browsing/quota-exceeded situations;
          // the in-memory state still updates, it just won't persist/broadcast.
        }
        // Deferred to a microtask so this fires after React finishes
        // processing *this* update - dispatching synchronously here would
        // have other components' listeners call setState while React is
        // still rendering/committing this component's own update.
        queueMicrotask(() => window.dispatchEvent(new CustomEvent(LOCAL_CHANGE_EVENT, { detail: key })));
        return next;
      });
    },
    [key],
  );

  return [state, setAndPersist];
}
