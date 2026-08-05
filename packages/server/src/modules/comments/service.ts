import { eq } from "drizzle-orm";
import type { Comment, CreateCommentInput } from "@notorious/shared";
import { db } from "../../db/client.js";
import { comments } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound, forbidden } from "../../lib/httpError.js";

function toComment(row: typeof comments.$inferSelect): Comment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    objectId: row.objectId,
    authorId: row.authorId,
    authorName: row.authorName,
    // Withheld once moderated - the tombstone (see migrations/0029_comments.sql)
    // is meant to disclose *that* and *by whom* a comment was removed, not to
    // keep showing its removed content. The row still keeps `body` in the
    // database itself, same "audit trail outlives the UI-visible copy"
    // reasoning as anything else soft-deleted in this app.
    body: row.deletedAt ? "" : row.body,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    deletedByName: row.deletedByName,
  };
}

/** Oldest first (a discussion thread reads top-to-bottom), including moderation tombstones - see CommentsPanel.tsx. */
export async function listComments(objectId: string): Promise<Comment[]> {
  const rows = await db.select().from(comments).where(eq(comments.objectId, objectId)).orderBy(comments.createdAt);
  return rows.map(toComment);
}

export async function createComment(
  workspaceId: string,
  objectId: string,
  authorId: string,
  authorName: string,
  input: CreateCommentInput,
): Promise<Comment> {
  const id = newId();
  const createdAt = nowIso();
  await db.insert(comments).values({
    id,
    workspaceId,
    objectId,
    authorId,
    authorName,
    body: input.body,
    createdAt,
  });
  return { id, workspaceId, objectId, authorId, authorName, body: input.body, createdAt, deletedAt: null, deletedByName: null };
}

async function getCommentOrThrow(commentId: string): Promise<typeof comments.$inferSelect> {
  const rows = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  const row = rows[0];
  if (!row || row.deletedAt) throw notFound("Comment not found");
  return row;
}

export async function getCommentObjectId(commentId: string): Promise<string> {
  return (await getCommentOrThrow(commentId)).objectId;
}

/**
 * The author deleting their own comment removes the row outright - there's
 * nothing to disclose there. An owner/editor deleting *someone else's*
 * comment instead soft-deletes it (see migrations/0029_comments.sql's own
 * doc comment) so the thread keeps a visible record of the moderation
 * action - `isModerator` is what the route decides via `requireAccess`'s
 * role check, not re-derived here.
 */
export async function deleteComment(
  commentId: string,
  actorId: string,
  actorName: string,
  isModerator: boolean,
): Promise<{ objectId: string; workspaceId: string }> {
  const row = await getCommentOrThrow(commentId);
  const isAuthor = row.authorId === actorId;
  if (!isAuthor && !isModerator) throw forbidden("You can only delete your own comments");

  if (isAuthor) {
    await db.delete(comments).where(eq(comments.id, commentId));
  } else {
    await db.update(comments).set({ deletedAt: nowIso(), deletedByName: actorName }).where(eq(comments.id, commentId));
  }

  return { objectId: row.objectId, workspaceId: row.workspaceId };
}
