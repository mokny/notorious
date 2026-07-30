import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeEvent } from "@notorious/shared";
import { clientId as myClientId } from "./clientId.js";

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
 */
export function useRealtime(workspaceId: string | undefined, shareToken?: string): void {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({ workspaceId });
    if (shareToken) query.set("shareToken", shareToken);
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws?${query.toString()}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as RealtimeEvent;

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
        }
      } else if (payload.entity === "block") {
        // Block-save events fire on every debounced keystroke. Skip the
        // refetch for changes this tab made itself - its own editor already
        // has the authoritative text, and racing a refetch against active
        // typing is what caused characters to occasionally get dropped.
        if (payload.clientId !== myClientId) {
          queryClient.invalidateQueries({ queryKey: ["blocks", payload.objectId ?? ""] });
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
    };

    return () => socket.close();
  }, [workspaceId, shareToken, queryClient]);
}
