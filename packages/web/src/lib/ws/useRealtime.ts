import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { PresenceSnapshotMessage, RealtimeEvent } from "@notorious/shared";
import { clientId as myClientId } from "./clientId.js";

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;

function handleMessage(payload: RealtimeEvent, workspaceId: string, queryClient: QueryClient): void {
  if (payload.entity === "object") {
    // Same reasoning as the "block" case below: title/property edits are
    // debounced-saved per keystroke too (see useDebouncedSave), so
    // refetching our own echoed change can race an active edit and
    // revert it. Compared by clientId (this browser tab), not actorId
    // (the user) - the same account open in two tabs must still see each
    // other's edits live, only a tab's own echo of itself gets skipped.
    if (payload.clientId !== myClientId) {
      queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["object", payload.entityId] });
      queryClient.invalidateQueries({ queryKey: ["viewResults"] });
      queryClient.invalidateQueries({ queryKey: ["backlinks", payload.entityId] });
      // A property edit can feed a template (`object.properties.<key>`, see
      // modules/templates/renderer.ts) - without this, another viewer's
      // already-rendered blocks would keep showing stale output for
      // whatever that property fed into until they reloaded the page.
      queryClient.invalidateQueries({ queryKey: ["blocksRendered", payload.entityId] });
    }
  } else if (payload.entity === "block") {
    // Block-save events fire on every debounced keystroke. Skip the
    // refetch for changes this tab made itself - its own editor already
    // has the authoritative text, and racing a refetch against active
    // typing is what caused characters to occasionally get dropped.
    if (payload.clientId !== myClientId) {
      queryClient.invalidateQueries({ queryKey: ["blocks", payload.objectId ?? ""] });
      // Same self-echo skip as above - refreshes the history panel (see
      // BlockHistoryPanel.tsx) if it's currently open on the block someone
      // else just changed.
      queryClient.invalidateQueries({ queryKey: ["blockHistory", payload.entityId] });
      // A changed block can be the source a template elsewhere in the same
      // object reads from (`blocks.<slug>`) - without this, another
      // viewer's already-rendered output would silently go stale until they
      // reloaded, which is what someone editing live alongside them would
      // actually notice as "the template doesn't update".
      queryClient.invalidateQueries({ queryKey: ["blocksRendered", payload.objectId ?? ""] });
    }
  } else if (payload.entity === "member") {
    queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  } else if (payload.entity === "relation") {
    queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["viewResults"] });
  } else if (payload.entity === "pin") {
    // Pin/unpin/reorder is a discrete, deliberate action (not a per-
    // keystroke stream like block saves) - refetching even for the tab
    // that made the change itself is harmless, so no clientId check.
    queryClient.invalidateQueries({ queryKey: ["pins", workspaceId] });
  }
}

/**
 * Opens one WebSocket connection per open workspace and invalidates the
 * relevant React Query caches whenever another client changes something -
 * this is what makes edits show up live across devices/collaborators.
 *
 * `shareToken` is set when this is an anonymous visitor following a public
 * share link (see SharePage.tsx) rather than a logged-in member - the socket
 * handshake can't carry the `X-Share-Token` header the REST API uses
 * (browsers don't let you set custom headers on a WebSocket), so it goes as
 * a query param instead; the server resolves it the same way either way.
 *
 * Reconnects with backoff on any drop: a backgrounded/throttled mobile tab
 * (or a laptop coming back from sleep) is exactly the kind of thing that
 * silently kills a WebSocket, and without this the tab would go
 * realtime-blind until the whole page reloads. On the first reconnect after
 * a drop, everything this hook knows how to invalidate gets invalidated
 * once, as a catch-up for whatever was missed while disconnected - the
 * per-entity, per-clientId filtering above only applies to messages that
 * actually arrive, which doesn't help for a gap with no messages at all.
 * `main.tsx`'s `refetchOnWindowFocus: true` covers the same "tab was away,
 * refresh what's missing" need from the other direction (a plain REST
 * refetch, independent of whether the socket itself reconnected yet).
 */
export function useRealtime(workspaceId: string | undefined, shareToken?: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = RECONNECT_BASE_DELAY_MS;
    let hasConnectedBefore = false;

    function connect(): void {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const query = new URLSearchParams({ workspaceId: workspaceId! });
      if (shareToken) query.set("shareToken", shareToken);
      socket = new WebSocket(`${protocol}//${window.location.host}/ws?${query.toString()}`);

      socket.onopen = () => {
        reconnectDelay = RECONNECT_BASE_DELAY_MS;
        if (hasConnectedBefore) {
          queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
          queryClient.invalidateQueries({ queryKey: ["object"] });
          queryClient.invalidateQueries({ queryKey: ["blocks"] });
          queryClient.invalidateQueries({ queryKey: ["blocksRendered"] });
          queryClient.invalidateQueries({ queryKey: ["blockHistory"] });
          queryClient.invalidateQueries({ queryKey: ["viewResults"] });
          queryClient.invalidateQueries({ queryKey: ["backlinks"] });
          queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
          queryClient.invalidateQueries({ queryKey: ["pins", workspaceId] });
        }
        hasConnectedBefore = true;
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as RealtimeEvent | PresenceSnapshotMessage;
        // Presence snapshots (see modules/presence/ server-side) share this
        // same per-workspace socket but aren't a `RealtimeEvent` - a DB-row-
        // change notification doesn't fit "here's the current viewer list"
        // (see PresenceSnapshotMessage's own doc comment) - distinguished by
        // a `type` field plain RealtimeEvents never have - `"type" in
        // payload` alone is a sufficient, exact discriminant (no need to
        // also compare its value) since `RealtimeEvent` has no `type`
        // property at all, and it's also what TypeScript needs to narrow
        // the union cleanly (a `payload.type === "presence"` comparison
        // doesn't narrow on its own when one arm of the union lacks the
        // property being compared).
        if ("type" in payload) {
          // usePresence.ts owns the actual viewer list via its own query -
          // this just tells it (and anyone else looking at the same object)
          // to go refetch, same "WS event -> invalidate -> refetch" idiom
          // every other entity here already uses.
          queryClient.invalidateQueries({ queryKey: ["presence", payload.objectId] });
          return;
        }
        handleMessage(payload, workspaceId!, queryClient);
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimeout = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, [workspaceId, shareToken, queryClient]);
}
