import { useEffect, useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationMessage } from "@notorious/shared";
import { notificationApi, workspaceApi } from "../lib/api/resources.js";
import { clientId as myClientId } from "../lib/ws/clientId.js";

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15_000;

/**
 * Unread-notification count per workspace, for the rail (`WorkspaceRail.tsx`)
 * and `WorkspacePickerPage`'s badges. `activeWorkspaceId` (undefined on
 * WorkspacePickerPage, since nothing is "active" there) is kept live by the
 * existing per-workspace `useRealtime.ts` socket - see its `notification`
 * case, which already invalidates `["notificationUnreadCount", workspaceId]`
 * for exactly this reason, so this hook doesn't open a second connection to
 * it. Every *other* workspace the user belongs to gets its own lightweight
 * background socket (`?scope=notifications`, see realtime/routes.ts), scoped
 * server-side to just notification pushes so switching workspaces doesn't
 * also drag in the full block/object/presence event stream for workspaces
 * you're not looking at.
 */
export function useWorkspaceUnreadCounts(activeWorkspaceId: string | undefined): Record<string, number> {
  const queryClient = useQueryClient();
  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list });
  const workspaceIds = useMemo(() => workspaces?.map((workspace) => workspace.id) ?? [], [workspaces]);

  const countQueries = useQueries({
    queries: workspaceIds.map((workspaceId) => ({
      queryKey: ["notificationUnreadCount", workspaceId],
      queryFn: () => notificationApi.unreadCount(workspaceId),
    })),
  });

  const counts: Record<string, number> = {};
  workspaceIds.forEach((workspaceId, index) => {
    counts[workspaceId] = countQueries[index]?.data?.count ?? 0;
  });

  const backgroundIds = useMemo(
    () => workspaceIds.filter((workspaceId) => workspaceId !== activeWorkspaceId),
    [workspaceIds, activeWorkspaceId],
  );
  const backgroundIdsKey = backgroundIds.join(",");

  useEffect(() => {
    if (!backgroundIdsKey) return;
    let cancelled = false;

    const connections = backgroundIdsKey.split(",").map((workspaceId) => {
      let socket: WebSocket | null = null;
      let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
      let reconnectDelay = RECONNECT_BASE_DELAY_MS;

      function connect(): void {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const query = new URLSearchParams({ workspaceId, clientId: myClientId, scope: "notifications" });
        socket = new WebSocket(`${protocol}//${window.location.host}/ws?${query.toString()}`);

        socket.onopen = () => {
          reconnectDelay = RECONNECT_BASE_DELAY_MS;
          // Catch-up for whatever was missed while this socket was down/not-yet-open.
          queryClient.invalidateQueries({ queryKey: ["notificationUnreadCount", workspaceId] });
        };

        socket.onmessage = (event) => {
          const payload = JSON.parse(event.data) as NotificationMessage | { type?: string };
          if (payload.type === "notification") {
            queryClient.invalidateQueries({ queryKey: ["notificationUnreadCount", workspaceId] });
          }
        };

        socket.onclose = () => {
          if (cancelled) return;
          reconnectTimeout = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS);
        };
      }
      connect();

      return {
        close: () => {
          clearTimeout(reconnectTimeout);
          socket?.close();
        },
      };
    });

    return () => {
      cancelled = true;
      for (const connection of connections) connection.close();
    };
  }, [backgroundIdsKey, queryClient]);

  return counts;
}
