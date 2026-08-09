import { eq, and } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { conversations, conversationParticipants, workspaces } from "../../db/schema.js";
import { forbidden, notFound, unauthorized } from "../../lib/httpError.js";
import { requireUser } from "../../plugins/session.js";

export interface ConversationAccessResult {
  userId: string;
  conversation: typeof conversations.$inferSelect;
}

/**
 * Workspace-agnostic analog of `workspaces/access.ts::requireAccess` - chat
 * has no anonymous/share-link concept at all (every participant is a
 * registered user, added by email), so this only ever checks real session
 * auth plus a `conversationParticipants` row, never `request.shareAccess`.
 */
export async function requireConversationAccess(
  request: FastifyRequest,
  conversationId: string,
): Promise<ConversationAccessResult> {
  const user = requireUser(request);
  const rows = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const conversation = rows[0];
  if (!conversation) throw notFound("Conversation not found");

  const participantRows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, user.id)))
    .limit(1);
  if (!participantRows[0]) throw unauthorized("You are not part of this conversation");

  return { userId: user.id, conversation };
}

/** Rename/delete a channel: the channel's creator, or the owner of the workspace it belongs to. DMs have no "manage" concept - only leaving. */
export async function requireChannelManageAccess(
  request: FastifyRequest,
  conversationId: string,
): Promise<ConversationAccessResult> {
  const access = await requireConversationAccess(request, conversationId);
  if (access.conversation.type !== "workspace_channel") {
    throw forbidden("Only channels can be renamed or deleted this way - leave a DM instead");
  }
  if (access.conversation.createdBy === access.userId) return access;

  const ownerRows = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, access.conversation.workspaceId!))
    .limit(1);
  if (ownerRows[0]?.ownerId === access.userId) return access;

  throw forbidden("Only the channel creator or the workspace owner can do this");
}
