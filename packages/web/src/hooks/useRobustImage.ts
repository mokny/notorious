import { useEffect, useRef, useState } from "react";

const AUTO_RETRY_DELAYS_MS = [500, 1500, 3000];

/**
 * Wraps a same-origin image URL with automatic retry-on-error (exponential
 * backoff, cache-busted via a query param so a truncated/interrupted
 * response isn't just replayed from the browser's HTTP cache) - written for
 * the "images sometimes load half-decoded on iOS PWA, reload always fixes
 * it" bug report, where the underlying fetch is transient and a plain
 * `<img>` has no way to notice or recover on its own. After
 * `AUTO_RETRY_DELAYS_MS` is exhausted, `failed` goes true and stays true
 * until `retry()` (a manual, user-initiated attempt) is called.
 */
export function useRobustImage(src: string | null | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const autoRetriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
    autoRetriesRef.current = 0;
    return () => clearTimeout(timeoutRef.current);
  }, [src]);

  function handleError() {
    if (autoRetriesRef.current < AUTO_RETRY_DELAYS_MS.length) {
      const delay = AUTO_RETRY_DELAYS_MS[autoRetriesRef.current];
      autoRetriesRef.current += 1;
      timeoutRef.current = setTimeout(() => setAttempt((a) => a + 1), delay);
    } else {
      setFailed(true);
    }
  }

  function retry() {
    autoRetriesRef.current = 0;
    setFailed(false);
    setAttempt((a) => a + 1);
  }

  const resolvedSrc = !src ? undefined : attempt === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}_retry=${attempt}`;

  return { src: resolvedSrc, failed, onError: handleError, retry };
}
