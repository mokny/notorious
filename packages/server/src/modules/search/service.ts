import { eq, and, isNull, or } from "drizzle-orm";
import type { SearchQuery, ObjectRecord, CreateSavedSearchInput, SavedSearch } from "@notorious/shared";
import { sqlite, db } from "../../db/client.js";
import { objects, objectValues, relations, savedSearches } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { getObject } from "../objects/service.js";
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

export async function searchObjects(workspaceId: string, query: SearchQuery): Promise<ObjectRecord[]> {
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

  return records;
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
