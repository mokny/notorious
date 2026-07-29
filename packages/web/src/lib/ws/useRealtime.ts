import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeEvent } from "@notorious/shared";

/**
 * Opens one WebSocket connection per open workspace and invalidates the
 * relevant React Query caches whenever another client changes something -
 * this is what makes edits show up live across devices/collaborators.
 */
export function useRealtime(workspaceId: string | undefined): void {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws?workspaceId=${workspaceId}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as RealtimeEvent;

      if (payload.entity === "object") {
        queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
        queryClient.invalidateQueries({ queryKey: ["object", payload.entityId] });
        queryClient.invalidateQueries({ queryKey: ["viewResults"] });
        queryClient.invalidateQueries({ queryKey: ["backlinks", payload.entityId] });
      } else if (payload.entity === "block") {
        queryClient.invalidateQueries({ queryKey: ["blocks", payload.objectId ?? ""] });
      } else if (payload.entity === "member") {
        queryClient.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      } else if (payload.entity === "relation") {
        queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
        queryClient.invalidateQueries({ queryKey: ["viewResults"] });
      }
    };

    return () => socket.close();
  }, [workspaceId, queryClient]);
}
