import type { FastifyInstance } from "fastify";
import { joinRoom, joinGlobalRoom, broadcastToConversation, sendToClientGlobal } from "./hub.js";
import { getMemberRole } from "../workspaces/access.js";
import { touchFocus, clearFocus } from "../chat/focusState.js";
import { getParticipantUserIds } from "../chat/service.js";
import { leaveCallBySocket } from "../calls/service.js";
import type { CallSignalPayload } from "@notorious/shared";

/**
 * WebSocket endpoint clients connect to for live updates:
 * `wss://host/ws?workspaceId=...`. One socket per open workspace on the client;
 * the client re-connects when switching workspaces. An anonymous share-link
 * visitor connects the same way plus `&shareToken=...` (browsers can't set
 * custom headers on a WebSocket handshake, hence the query param - resolved
 * into `request.shareAccess` by the same session-plugin hook that resolves
 * the `X-Share-Token` header for the REST API, see plugins/session.ts) -
 * see `useRealtime.ts`.
 */
export async function registerRealtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, async (socket, request) => {
    const { workspaceId, clientId } = request.query as { workspaceId?: string; clientId?: string };
    if (!workspaceId) {
      socket.close(4001, "Unauthorized");
      return;
    }

    const user = request.user;
    if (user) {
      const role = await getMemberRole(workspaceId, user.id);
      if (!role) {
        socket.close(4003, "Forbidden");
        return;
      }
      joinRoom(workspaceId, socket, null, clientId, user.id);
      return;
    }

    const share = request.shareAccess;
    if (share) {
      if (share.workspaceId !== workspaceId) {
        socket.close(4003, "Forbidden");
        return;
      }
      // A single-object share only ever gets events for that object (see
      // `broadcast` in ./hub.ts) - it must not learn that other objects in
      // the workspace exist or changed, same boundary the REST API enforces.
      joinRoom(workspaceId, socket, share.objectId, clientId);
      return;
    }

    socket.close(4001, "Unauthorized");
  });

  /**
   * Workspace-agnostic chat channel: `wss://host/ws/chat?clientId=...`. No
   * `workspaceId`/share-token handling at all - chat has no anonymous-
   * visitor concept, every participant is a registered user (see
   * chat/access.ts). Kept as a second endpoint rather than relaxing `/ws`
   * above so a workspace-scoped socket's room semantics (object-id
   * filtering, `sendToUser`) never have to branch on a missing workspaceId -
   * see hub.ts's doc comment on `socketsByUserId`. Also carries a small
   * `{type:"focus", conversationId}` heartbeat used to suppress push
   * notifications while the sender is actively looking at that conversation
   * (see chat/focusState.ts) - cheaper than a separate HTTP heartbeat since
   * this socket is already open.
   */
  app.get("/ws/chat", { websocket: true }, (socket, request) => {
    const user = request.user;
    if (!user) {
      socket.close(4001, "Unauthorized");
      return;
    }

    // Every /ws/chat connection now carries a clientId - chat itself never
    // needed to address one specific tab, but calls do ("stop ringing on my
    // other devices", signaling relay to the exact peer connection waiting
    // for it - see hub.ts's clientIdBySocket).
    const { clientId } = request.query as { clientId?: string };
    if (!clientId) {
      socket.close(4001, "Missing clientId");
      return;
    }

    joinGlobalRoom(user.id, socket, clientId);

    socket.on("message", (raw: Buffer) => {
      (async () => {
        const data = JSON.parse(raw.toString()) as {
          type?: string;
          conversationId?: string;
          toUserId?: string;
          toClientId?: string;
          callId?: string;
          signal?: unknown;
        };
        if (data.type === "focus" && typeof data.conversationId === "string") {
          touchFocus(user.id, data.conversationId, socket);
        } else if (data.type === "unfocus") {
          clearFocus(socket);
        } else if (data.type === "typing" && typeof data.conversationId === "string") {
          // Ephemeral relay only - never persisted, see ChatTypingEvent's doc comment.
          const participantUserIds = await getParticipantUserIds(data.conversationId);
          broadcastToConversation(
            participantUserIds.filter((id) => id !== user.id),
            { type: "chatTyping", conversationId: data.conversationId, userId: user.id, userName: user.name },
          );
        } else if (data.type === "callSignal" && data.toUserId && data.toClientId && data.callId && data.signal) {
          // Pure relay - the server never inspects `signal` (SDP/ICE
          // candidate), just forwards it to the exact peer connection
          // waiting for it (see chat/calls's mesh renegotiation rules).
          sendToClientGlobal(data.toUserId, data.toClientId, {
            type: "callSignal",
            callId: data.callId,
            fromUserId: user.id,
            fromClientId: clientId,
            toUserId: data.toUserId,
            toClientId: data.toClientId,
            signal: data.signal as CallSignalPayload,
          });
        }
      })().catch(() => {
        // Ignore malformed frames / lookup failures - this channel has no client->server message worth failing the connection over.
      });
    });

    socket.on("close", () => {
      clearFocus(socket);
      void leaveCallBySocket(socket);
    });
  });
}
