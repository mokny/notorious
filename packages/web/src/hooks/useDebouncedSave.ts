import { useEffect, useRef, useState } from "react";

const SAVE_DEBOUNCE_MS = 500;

/**
 * Local-first, debounced, serialized editing for a single field bound to
 * server state (title, a text/number/url/... property, ...).
 *
 * The naive pattern - a controlled input whose `value` comes straight from a
 * query and whose `onChange` fires a mutation on every keystroke - loses
 * characters under real network latency: each keystroke both saves *and*
 * invalidates the query, so a slow save's refetch can land after a faster,
 * later one and silently revert the field to older, shorter text while the
 * user is still typing (the same failure mode the block editor had).
 *
 * This hook keeps local state as the source of truth for rendering, adopts
 * external changes (e.g. from another collaborator) only when they don't
 * clobber an edit we're still mid-debounce on, and serializes saves so a
 * slow one can never overwrite a faster, newer one.
 */
export function useDebouncedSave<T>(externalValue: T, onSave: (value: T) => Promise<void>) {
  const [localValue, setLocalValue] = useState(externalValue);
  const lastKnownRef = useRef(externalValue);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const isSavingRef = useRef(false);
  const hasPendingRef = useRef(false);
  const pendingValueRef = useRef<T>(externalValue);

  useEffect(() => {
    // Never adopt an external refetch while a local edit is saving or still
    // queued: that refetch is most likely just our own prior (now-stale)
    // save echoing back, and applying it would revert whatever newer text
    // the user has typed since. Only sync once we're fully caught up.
    if (isSavingRef.current || hasPendingRef.current) return;
    if (externalValue !== lastKnownRef.current) {
      lastKnownRef.current = externalValue;
      setLocalValue(externalValue);
    }
  }, [externalValue]);

  useEffect(() => () => clearTimeout(saveTimeout.current), []);

  function flush(): void {
    if (isSavingRef.current || !hasPendingRef.current) return;
    const value = pendingValueRef.current;
    hasPendingRef.current = false;
    isSavingRef.current = true;

    onSave(value)
      .catch(() => {
        // Surfaced via the owning query's own error state if needed; the
        // save loop just needs to keep going for whatever value is next.
      })
      .finally(() => {
        isSavingRef.current = false;
        flush();
      });
  }

  function update(value: T): void {
    setLocalValue(value);
    lastKnownRef.current = value;
    pendingValueRef.current = value;
    hasPendingRef.current = true;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  /** Saves a pending edit right away instead of waiting out the rest of the debounce window - see TemplatableMarkdown.tsx/useTemplatableField.ts, which call this on blur so a templated field's rendered value shows up without an extra ~500ms wait. A no-op if there's nothing pending. */
  function flushNow(): void {
    clearTimeout(saveTimeout.current);
    flush();
  }

  return [localValue, update, flushNow] as const;
}
