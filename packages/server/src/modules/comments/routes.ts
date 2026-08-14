import type { FastifyInstance } from "fastify";
import { createCommentSchema, roleAtLeast } from "@notorious/shared";
import type { FastifyRequest } from "fastify";
import { badRequest } from "../../lib/httpError.js";
import { getClientId } from "../../plugins/session.js";
import { requireAccess, resolveActor, getMemberRole } from "../workspaces/access.js";
import { getObjectWorkspaceId, isCommentsDisabled, getObject } from "../objects/service.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import { notifyCommentParticipants, notifyMentionedUsers } from "../notifications/service.js";
import * as commentService from "./service.js";

/** True for a real member with at least editor access, or an editor(+)-role share link - the set of callers allowed to delete *someone else's* comment (own-comment deletes don't need this, see commentService.deleteComment). */
async function canModerate(request: FastifyRequest, workspaceId: string): Promise<boolean> {
  if (request.user) {
    const role = await getMemberRole(workspaceId, request.user.id);
    return Boolean(role && roleAtLeast(role, "editor"));
  }
  const share = request.shareAccess;
  return Boolean(share && roleAtLeast(share.role, "editor"));
}

export async function registerCommentRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/objects/:objectId/comments", async (request) => {
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    return commentService.listComments(objectId);
  });

  // `minRole: "commenter"` - below the "editor" threshold that triggers
  // `requireAccess`'s object-lock check (see workspaces/access.ts), so
  // posting a comment works on a locked object without needing
  // `allowWhenLocked`. `commentsDisabled` is a separate, comment-specific
  // rule checked explicitly here instead. Rate-limited (see app.ts) as this
  // app's only spam-prevention measure for a feature open to every
  // commenter-role caller, including anonymous share-link visitors.
  app.post(
    "/api/v1/objects/:objectId/comments",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { objectId } = request.params as { objectId: string };
      const workspaceId = await getObjectWorkspaceId(objectId);
      const access = await requireAccess(request, workspaceId, "commenter", { objectId, allowWhenLocked: true });
      if (await isCommentsDisabled(objectId)) throw badRequest("Comments are disabled on this object");

      const input = createCommentSchema.parse(request.body);
      const author = resolveActor(request, access);
      const comment = await commentService.createComment(workspaceId, objectId, author.actorId, author.actorName, input);

      await recordAndBroadcast({
        workspaceId,
        objectId,
        actorId: author.actorId,
        clientId: getClientId(request),
        action: "commented",
        summary: `${author.actorName} commented`,
        entity: "comment",
        entityId: comment.id,
        realtimeAction: "created",
      });

      const object = await getObject(objectId);
      await notifyCommentParticipants({
        workspaceId,
        objectId,
        objectTitle: object.title,
        commentId: comment.id,
        actorId: author.actorId,
        actorName: author.actorName,
        body: comment.body,
      });
      await notifyMentionedUsers({
        workspaceId,
        objectId,
        objectTitle: object.title,
        actorId: author.actorId,
        actorName: author.actorName,
        source: "mention-comment",
        previousText: "",
        nextText: comment.body,
        commentId: comment.id,
      }).catch(() => {});

      reply.code(201);
      return comment;
    },
  );

  app.delete("/api/v1/comments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const objectId = await commentService.getCommentObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "commenter", { objectId, allowWhenLocked: true });
    const moderator = await canModerate(request, workspaceId);
    const actor = resolveActor(request, access);

    await commentService.deleteComment(id, actor.actorId, actor.actorName, moderator);

    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: actor.actorId,
      clientId: getClientId(request),
      action: "updated",
      summary: `${actor.actorName} deleted a comment`,
      entity: "comment",
      entityId: id,
      realtimeAction: "deleted",
    });

    reply.code(204);
  });
}
