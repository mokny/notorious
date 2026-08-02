import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultAnimalNameForVisitor, type PresenceViewer } from "@notorious/shared";
import { presenceApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { getStoredAnonName, getVisitorId, setStoredAnonName } from "../lib/visitorIdentity.js";
import { randomId } from "../lib/randomId.js";

const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Who's currently viewing `objectId` - sends a heartbeat on mount and every
 * `HEARTBEAT_INTERVAL_MS` after, and an explicit leave on unmount (see
 * lib/api/client.ts's `keepalive` option, which is what lets that leave
 * request survive navigating away/closing the tab). The viewer list itself
 * comes from a plain `useQuery` that a WS presence broadcast invalidates
 * (see useRealtime.ts) - the same "WS event -> invalidate -> refetch" shape
 * every other live-updating piece of this app already uses.
 */
export function usePresence(objectId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["presence", objectId];

  const { data } = useQuery({
    queryKey,
    queryFn: () => presenceApi.list(objectId!),
    enabled: Boolean(objectId),
  });
  const viewers: PresenceViewer[] = data?.viewers ?? [];

  const visitorId = getVisitorId();
  // The client computes its own default animal deterministically (same
  // function the server uses to validate/fall back to) purely so it always
  // has *something* to send as its current word on every heartbeat - it
  // never needs a round-trip just to find out what it would be.
  const currentAnonWord = getStoredAnonName() ?? defaultAnimalNameForVisitor(visitorId);
  const selfViewerId = user ? `member:${user.id}` : `anon:${visitorId}`;
  const self = viewers.find((viewer) => viewer.viewerId === selfViewerId) ?? null;

  const heartbeatMutation = useMutation({
    mutationFn: ({ tabId, word }: { tabId: string; word: string }) =>
      presenceApi.heartbeat(objectId!, user ? { tabId } : { tabId, visitorId, displayName: word }),
    // Writes the response straight into the query cache instead of just
    // invalidating - the heartbeat's own response *is* the fresh snapshot,
    // so this shows this tab's own rename/join immediately without waiting
    // on a round-trip through the WS broadcast this same request triggers.
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
  });

  // The active effect run's tabId, so `rename()` (a direct user action, not
  // part of the mount/interval lifecycle) can reuse the *same* slot instead
  // of registering a second, orphaned one that would just sit there until
  // the next sweep - see the effect below for why this id has to be
  // per-effect-instance in the first place, not a plain stable ref value.
  const activeTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!objectId) return;
    // Generated fresh *inside* the effect (not a stable per-component ref)
    // deliberately - React 18 StrictMode runs this effect mount -> cleanup
    // -> mount once in dev, and the app's shared per-*browser-tab*
    // `clientId` would make both of those runs look like the same viewer
    // slot to the server, letting the first (synthetic) cleanup's leave
    // race the second (real) mount's join and sometimes delete it - see
    // presenceHeartbeatSchema's own doc comment. A fresh id per effect
    // *instance* instead means each one only ever cleans up after itself.
    const tabId = randomId();
    activeTabIdRef.current = tabId;
    // Kept (not fired-and-forgotten like the interval's own repeats below) -
    // the cleanup needs to wait on this specific call, see its own comment.
    const initialJoin = heartbeatMutation.mutateAsync({ tabId, word: currentAnonWord }).catch(() => {});
    const interval = setInterval(() => heartbeatMutation.mutate({ tabId, word: currentAnonWord }), HEARTBEAT_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      if (activeTabIdRef.current === tabId) activeTabIdRef.current = null;
      // Waits for *this instance's own* join to actually land server-side
      // before sending its leave. A plain effect can't be async, so both
      // the mount's join and this cleanup's leave fire without the caller
      // ever awaiting either - normally harmless, but React 18 StrictMode's
      // dev-only mount -> cleanup -> mount runs both almost simultaneously,
      // and an unordered leave can reach the server *before* its own join
      // did. That leave then finds nothing to remove and silently no-ops,
      // orphaning a tab entry nothing else knows to retry - which keeps the
      // whole identity looking "still here" until the 60s sweep, even after
      // the real, active tab has properly left. Chaining onto the join
      // (regardless of whether it succeeded) guarantees this specific
      // tabId's own leave always follows its own join.
      void initialJoin.then(() => presenceApi.leave(objectId, tabId, user ? undefined : visitorId));
    };
    // `currentAnonWord`/`visitorId` intentionally excluded - they're derived
    // from localStorage, not props/state, and re-running this effect for
    // every keystroke of a rename would just mean an extra network call;
    // `rename()` below already sends its own heartbeat immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, user?.id]);

  function rename(word: string): void {
    const trimmed = word.trim();
    if (!trimmed || !activeTabIdRef.current) return;
    setStoredAnonName(trimmed);
    heartbeatMutation.mutate({ tabId: activeTabIdRef.current, word: trimmed });
  }

  return { viewers, self, rename, currentWord: currentAnonWord };
}
