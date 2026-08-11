import { eq, and, isNull, or, inArray } from "drizzle-orm";
import type { SearchQuery, ObjectRecord, CreateSavedSearchInput, SavedSearch, MessageSearchResult } from "@notorious/shared";
import { sqlite, db } from "../../db/client.js";
import { objects, objectValues, relations, savedSearches, conversationParticipants, conversations, users } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { getObject, redactForReverify } from "../objects/service.js";
import { fuzzyScore } from "./fuzzy.js";

async function objectsByIds(ids: string[]): Promise<ObjectRecord[]> {
  const results: ObjectRecord[] = [];
  for (const id of ids) {
    try {
      results.push(await getObject(id));
    } catch {
      // object was deleted between index lookup and hydration - skip it
    }
  }
  return results;
}

async function fullTextSearch(workspaceId: string, query: string, limit: number): Promise<string[]> {
  if (!query.trim()) return [];

  const escaped = query.replace(/"/g, '""');
  const rows = sqlite
    .prepare(
      `SELECT o.id AS id, bm25(objects_fts) AS rank
       FROM objects_fts
       JOIN objects o ON o.id = objects_fts.object_id
       WHERE objects_fts MATCH ? AND o.workspace_id = ? AND o.archived_at IS NULL
       ORDER BY rank
       LIMIT ?`,
    )
    .all(`"${escaped}"`, workspaceId, limit) as { id: string; rank: number }[];

  return rows.map((row) => row.id);
}

/** Fuzzy fallback: scores every workspace object title against the query. Used when
 *  the exact/trigram full-text match returns few or no results. */
async function fuzzyTitleSearch(workspaceId: string, query: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: objects.id, title: objects.title })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), isNull(objects.archivedAt)));

  return rows
    .map((row) => ({ id: row.id, score: fuzzyScore(query, row.title) }))
    .filter((row) => row.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.id);
}

async function tagSearch(propertyId: string, tagValue: string): Promise<string[]> {
  const rows = await db.select().from(objectValues).where(eq(objectValues.propertyId, propertyId));
  return rows
    .filter((row) => {
      if (!row.value) return false;
      try {
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) ? parsed.includes(tagValue) : parsed === tagValue;
      } catch {
        return false;
      }
    })
    .map((row) => row.objectId);
}

async function relationSearch(objectId: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(relations)
    .where(or(eq(relations.sourceObjectId, objectId), eq(relations.targetObjectId, objectId)));
  return [...new Set(rows.map((row) => (row.sourceObjectId === objectId ? row.targetObjectId : row.sourceObjectId)))];
}

/**
 * `hasSudo` - whether the requesting session is currently reverified (see
 * modules/reverify/service.ts's `isSudoActive`). Without it, a
 * `requiresReverify` object's *content* must never surface through search -
 * neither in a snippet nor by being findable through a content match at all
 * (only a title match still finds it) - matching the same "title only until
 * reverified" rule the sidebar/object-list applies (see
 * objects/service.ts's `redactForReverify`).
 */
export async function searchObjects(workspaceId: string, query: SearchQuery, hasSudo: boolean): Promise<ObjectRecord[]> {
  let ids: string[];

  if (query.tagPropertyId && query.tagValue) {
    ids = await tagSearch(query.tagPropertyId, query.tagValue);
  } else if (query.relatedToObjectId) {
    ids = await relationSearch(query.relatedToObjectId);
  } else if (query.q.trim()) {
    ids = await fullTextSearch(workspaceId, query.q, query.limit);
    if (query.fuzzy && ids.length < query.limit) {
      const fuzzyIds = await fuzzyTitleSearch(workspaceId, query.q, query.limit - ids.length);
      ids = [...new Set([...ids, ...fuzzyIds.filter((id) => !ids.includes(id))])];
    }
  } else {
    const rows = await db
      .select({ id: objects.id })
      .from(objects)
      .where(and(eq(objects.workspaceId, workspaceId), isNull(objects.archivedAt)));
    ids = rows.map((row) => row.id).slice(0, query.limit);
  }

  let records = await objectsByIds(ids.slice(0, query.limit));

  if (query.objectTypeId) {
    records = records.filter((record) => record.objectTypeId === query.objectTypeId);
  }

  const trimmedQuery = query.q.trim().toLowerCase();
  if (!hasSudo && trimmedQuery) {
    // A protected object may only surface here via its *title* - if the
    // match came from block content (full-text/fuzzy both search bodies,
    // see fullTextSearch/fuzzyTitleSearch... titles above), drop it rather
    // than let its existence-plus-content-match leak through search.
    records = records.filter((record) => !record.requiresReverify || record.title.toLowerCase().includes(trimmedQuery));
  }

  return records.map((record) => redactForReverify(record, hasSudo));
}

/**
 * Chat messages are workspace-independent (a DM has no `workspace_id`), so
 * unlike `searchObjects` above this scopes by `conversation_participants`
 * membership instead of a workspace id - see chat/service.ts's own doc
 * comments for why messages live in a separate `messages_fts` table rather
 * than folding into `objects_fts`.
 */
export async function searchMessages(userId: string, query: string, limit: number): Promise<MessageSearchResult[]> {
  if (!query.trim()) return [];

  const participantRows = await db.select({ conversationId: conversationParticipants.conversationId }).from(conversationParticipants).where(eq(conversationParticipants.userId, userId));
  const conversationIds = participantRows.map((r) => r.conversationId);
  if (conversationIds.length === 0) return [];

  const escaped = query.replace(/"/g, '""');
  const placeholders = conversationIds.map(() => "?").join(",");
  const rows = sqlite
    .prepare(
      `SELECT m.id AS messageId, m.conversation_id AS conversationId, m.body AS body, m.author_id AS authorId, m.created_at AS createdAt, bm25(messages_fts) AS rank
       FROM messages_fts
       JOIN messages m ON m.id = messages_fts.message_id
       WHERE messages_fts MATCH ? AND m.conversation_id IN (${placeholders}) AND m.deleted_at IS NULL
       ORDER BY rank
       LIMIT ?`,
    )
    .all(`"${escaped}"`, ...conversationIds, limit) as {
    messageId: string;
    conversationId: string;
    body: string;
    authorId: string;
    createdAt: string;
  }[];
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const authorRows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds));
  const authorNameById = new Map(authorRows.map((u) => [u.id, u.name]));

  const resultConversationIds = [...new Set(rows.map((r) => r.conversationId))];
  const conversationRows = await db.select().from(conversations).where(inArray(conversations.id, resultConversationIds));
  const conversationById = new Map(conversationRows.map((c) => [c.id, c]));

  const otherParticipantRows = await db
    .select({ conversationId: conversationParticipants.conversationId, userId: conversationParticipants.userId, name: users.name })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(inArray(conversationParticipants.conversationId, resultConversationIds));
  const otherNamesByConversation = new Map<string, string[]>();
  for (const row of otherParticipantRows) {
    if (row.userId === userId) continue;
    const list = otherNamesByConversation.get(row.conversationId) ?? [];
    list.push(row.name);
    otherNamesByConversation.set(row.conversationId, list);
  }

  return rows.map((row) => {
    const conversation = conversationById.get(row.conversationId);
    const conversationName =
      conversation?.type === "workspace_channel" ? (conversation.name ?? "Channel") : (otherNamesByConversation.get(row.conversationId)?.join(", ") ?? "Direct Message");

    return {
      conversationId: row.conversationId,
      conversationName,
      messageId: row.messageId,
      body: row.body,
      authorName: authorNameById.get(row.authorId) ?? "Unknown",
      createdAt: row.createdAt,
    };
  });
}

export async function listSavedSearches(workspaceId: string, userId: string): Promise<SavedSearch[]> {
  const rows = await db
    .select()
    .from(savedSearches)
    .where(and(eq(savedSearches.workspaceId, workspaceId), eq(savedSearches.userId, userId)));

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    name: row.name,
    query: row.query,
    filters: JSON.parse(row.filters),
  }));
}

export async function createSavedSearch(
  workspaceId: string,
  userId: string,
  input: CreateSavedSearchInput,
): Promise<SavedSearch> {
  const id = newId();
  await db.insert(savedSearches).values({
    id,
    workspaceId,
    userId,
    name: input.name,
    query: input.query,
    filters: JSON.stringify(input.filters),
    createdAt: nowIso(),
  });
  return { id, workspaceId, userId, name: input.name, query: input.query, filters: input.filters };
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await db.delete(savedSearches).where(eq(savedSearches.id, id));
}
