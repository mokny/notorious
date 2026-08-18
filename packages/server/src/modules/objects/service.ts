import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import type {
  CreateObjectInput,
  UpdateObjectInput,
  CreateRelationInput,
  ObjectRecord,
  CoverTextStyle,
  Relation,
  ViewFilter,
  ViewSort,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import { objects, relations, objectValues, objectTypes, blocks, workspaces } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound, locked, conflict, forbidden, badRequest } from "../../lib/httpError.js";
import { slugify, randomSlugSuffix } from "../../lib/slug.js";
import { listProperties } from "../schema/service.js";
import { resolveValuesForObjects } from "./valueResolver.js";
import { applyFilters, compareForSort, MAX_SCAN } from "./query.js";
import { reindexObjectBody, removeFromIndex } from "../search/indexer.js";
import { listFilesForObject, deleteFile } from "../files/service.js";
import { positionBetween } from "../../lib/position.js";
import { assertVariableNameAvailable, isVariableObjectType, getVariableValue } from "../variables/service.js";
import { notifyMentionedUsers } from "../notifications/service.js";

function toRecord(row: typeof objects.$inferSelect, values: Record<string, unknown>): ObjectRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    objectTypeId: row.objectTypeId,
    title: row.title,
    icon: row.icon,
    cover: row.cover,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    scriptSource: row.scriptSource,
    scriptEnabled: row.scriptEnabled,
    scriptLastRun: row.scriptLastRunAt
      ? {
          ranAt: row.scriptLastRunAt,
          success: Boolean(row.scriptLastRunSuccess),
          triggerType: (row.scriptLastRunTrigger ?? "manual") as "manual" | "automation",
          durationMs: row.scriptLastRunDurationMs ?? 0,
          log: row.scriptLastRunLog ?? "",
          error: row.scriptLastRunError,
        }
      : null,
    coverTextStyle: row.coverTextStyle ? (JSON.parse(row.coverTextStyle) as CoverTextStyle) : null,
    slug: row.slug,
    commentsDisabled: row.commentsDisabled,
    requiresReverify: row.requiresReverify,
    ownerOnlyEdit: row.ownerOnlyEdit,
    allowApiEditsOverride: row.allowApiEditsOverride,
    values: values as ObjectRecord["values"],
  };
}

/** Derives a default slug from the title, unique within the workspace - see db/schema.ts's `objects.slug`. Collision is checked once; a random suffix makes a second one astronomically unlikely, not worth retry-looping over. */
async function generateUniqueObjectSlug(workspaceId: string, title: string): Promise<string> {
  const base = slugify(title) || "object";
  const existing = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, base)))
    .limit(1);
  return existing[0] ? `${base}_${randomSlugSuffix()}` : base;
}

async function assertObjectSlugAvailable(workspaceId: string, slug: string, excludeObjectId: string): Promise<void> {
  const existing = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, slug)))
    .limit(1);
  if (existing[0] && existing[0].id !== excludeObjectId) {
    throw conflict(`Another object in this workspace already uses the id "${slug}"`);
  }
}

/**
 * Strips script-related fields before a record reaches an anonymous
 * share-link session - scripting is deliberately members-only (see
 * workspaces/access.ts's `requireRealMemberAccess`), and that boundary
 * should mean "a share visitor can't even see this object has a script",
 * not just "can't run/edit it". Applied at the route layer (see
 * objects/routes.ts), which is where `request.shareAccess` is known.
 */
export function redactScriptForShare(record: ObjectRecord): ObjectRecord {
  return { ...record, scriptSource: null, scriptEnabled: false, scriptLastRun: null };
}

/**
 * Strips everything except id/title/icon/type from a `requiresReverify`
 * object when the requester hasn't recently reverified - applied to bulk
 * listing/search results (workspace object list, search), which - unlike a
 * single `GET /api/v1/objects/:id` - aren't refused outright by
 * `workspaces/access.ts`'s `requireAccess` (there's no single `objectId` to
 * gate there). Lets the object still show up (title + a lock affordance) in
 * the sidebar/search without leaking any of its actual content.
 */
export function redactForReverify(record: ObjectRecord, hasSudo: boolean): ObjectRecord {
  if (!record.requiresReverify || hasSudo) return record;
  return {
    ...record,
    cover: null,
    scriptSource: null,
    scriptEnabled: false,
    scriptLastRun: null,
    coverTextStyle: null,
    slug: null,
    values: {},
  };
}

/** Who is asking, for `assertObjectEditable`'s owner-only/API-override checks below. */
export interface EditableContext {
  isOwner: boolean;
  authMethod: "session" | "apiKey" | null;
}

/**
 * Throws 423 if `objectId` is currently locked, or 403 if it's marked
 * owner-only and the caller isn't the workspace owner - the enforcement side
 * of the lock and "Object Settings" owner-only toggles (see objects/routes.ts).
 * An `authMethod: "apiKey"` caller (covers MCP too, see plugins/session.ts)
 * bypasses both when the object's `allowApiEditsOverride` is set - the UI
 * itself never sets that auth method, so this can't be used to route around
 * either restriction from the browser. Called from `workspaces/access.ts`'s
 * `requireAccess` for every object-scoped editor+ request, plus explicitly
 * from the handful of mutating routes that check access via
 * `requireWorkspaceRole` instead (relations, object delete) - see those call
 * sites for why they can't go through `requireAccess` itself.
 */
export async function assertObjectEditable(objectId: string, context: EditableContext): Promise<void> {
  const rows = await db
    .select({ lockedAt: objects.lockedAt, ownerOnlyEdit: objects.ownerOnlyEdit, allowApiEditsOverride: objects.allowApiEditsOverride })
    .from(objects)
    .where(eq(objects.id, objectId))
    .limit(1);
  const row = rows[0];
  if (!row) return;

  const apiOverride = context.authMethod === "apiKey" && row.allowApiEditsOverride;
  if (row.lockedAt && !apiOverride) throw locked();
  if (row.ownerOnlyEdit && !context.isOwner && !apiOverride) throw forbidden("Only the workspace owner can edit this object");
}

export async function setObjectLocked(objectId: string, userId: string | null, isLocked: boolean): Promise<ObjectRecord> {
  await db
    .update(objects)
    .set({ lockedAt: isLocked ? nowIso() : null, lockedBy: isLocked ? userId : null })
    .where(eq(objects.id, objectId));
  return getObject(objectId);
}

/** True once `objects.commentsDisabled` is set - the enforcement side of the owner-only toggle (see objects/routes.ts). Checked explicitly by modules/comments/service.ts's `createComment`, not folded into `assertObjectEditable`/`requireAccess` since it's a distinct rule from the object lock. */
export async function isCommentsDisabled(objectId: string): Promise<boolean> {
  const rows = await db
    .select({ commentsDisabled: objects.commentsDisabled })
    .from(objects)
    .where(eq(objects.id, objectId))
    .limit(1);
  return Boolean(rows[0]?.commentsDisabled);
}

export async function setCommentsDisabled(objectId: string, disabled: boolean): Promise<ObjectRecord> {
  await db.update(objects).set({ commentsDisabled: disabled }).where(eq(objects.id, objectId));
  return getObject(objectId);
}

/** True once `objects.requiresReverify` is set - the enforcement side of the "vault" toggle (see objects/routes.ts). Checked by `workspaces/access.ts`'s `requireAccess` for *every* object-scoped request, unlike `lockedAt`/`commentsDisabled`, which only ever gate editor-role writes. */
export async function isObjectReverifyProtected(objectId: string): Promise<boolean> {
  const rows = await db.select({ requiresReverify: objects.requiresReverify }).from(objects).where(eq(objects.id, objectId)).limit(1);
  return Boolean(rows[0]?.requiresReverify);
}

export async function setObjectRequiresReverify(objectId: string, requiresReverify: boolean): Promise<ObjectRecord> {
  await db.update(objects).set({ requiresReverify }).where(eq(objects.id, objectId));
  return getObject(objectId);
}

export async function setObjectOwnerOnlyEdit(objectId: string, ownerOnlyEdit: boolean): Promise<ObjectRecord> {
  await db.update(objects).set({ ownerOnlyEdit }).where(eq(objects.id, objectId));
  return getObject(objectId);
}

export async function setObjectAllowApiEditsOverride(objectId: string, allowApiEditsOverride: boolean): Promise<ObjectRecord> {
  await db.update(objects).set({ allowApiEditsOverride }).where(eq(objects.id, objectId));
  return getObject(objectId);
}

export async function createObject(
  workspaceId: string,
  userId: string,
  input: CreateObjectInput,
): Promise<ObjectRecord> {
  if (await isVariableObjectType(input.objectTypeId)) {
    await assertVariableNameAvailable(workspaceId, input.title);
  }

  const id = newId();
  const now = nowIso();
  const slug = await generateUniqueObjectSlug(workspaceId, input.title);

  await db.insert(objects).values({
    id,
    workspaceId,
    objectTypeId: input.objectTypeId,
    title: input.title,
    icon: input.icon ?? null,
    cover: input.cover ?? null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    slug,
    // Comments default to disabled - the owner opts in via the toolbar icon
    // next to Share (see setCommentsDisabled/objects/routes.ts). Set
    // explicitly rather than relying on the column's own SQL default, which
    // migrations/0030_notifications.sql left at `0` for backward-compat
    // reasons with objects created before that flip.
    commentsDisabled: true,
  });

  if (Object.keys(input.values).length > 0) {
    await writeStoredValues(id, input.objectTypeId, workspaceId, input.title, input.values);
  }

  await seedWhiteboardBlockIfNeeded(id, input.objectTypeId, now);

  await reindexObjectBody(id, input.title);
  return getObject(id);
}

/** A brand-new Whiteboard object starts with one ready-to-draw-on canvas block, rather than the normal empty block list requiring a slash command first - the block itself is otherwise a completely ordinary block (see modules/blocks/service.ts), just created directly here instead of through that module to avoid a service-to-service import for this one bootstrap step. */
async function seedWhiteboardBlockIfNeeded(objectId: string, objectTypeId: string, createdAt: string): Promise<void> {
  const typeRows = await db.select({ key: objectTypes.key }).from(objectTypes).where(eq(objectTypes.id, objectTypeId)).limit(1);
  if (typeRows[0]?.key !== "whiteboard") return;

  await db.insert(blocks).values({
    id: newId(),
    objectId,
    parentBlockId: null,
    type: "whiteboard",
    content: "{}",
    position: positionBetween(null, null),
    createdAt,
    updatedAt: createdAt,
  });
}

/** Narrows an arbitrary computed value (a Variable's `list`/`json` value type can be any JSON shape) down to `PropertyValue` - non-primitive, non-string-array shapes are stringified so `ObjectRecord.values` stays honestly typed for every consumer. */
function toPropertyValue(value: unknown): ObjectRecord["values"][string] {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  return JSON.stringify(value);
}

export async function getObjectWorkspaceId(objectId: string): Promise<string> {
  const rows = await db
    .select({ workspaceId: objects.workspaceId })
    .from(objects)
    .where(eq(objects.id, objectId))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound("Object not found");
  return row.workspaceId;
}

export async function getObject(objectId: string): Promise<ObjectRecord> {
  const rows = await db.select().from(objects).where(eq(objects.id, objectId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Object not found");

  const props = await listProperties(row.objectTypeId);
  const values = await resolveValuesForObjects([objectId], props);
  const resolved = values.get(objectId) ?? {};

  // A Variable's actual value is never stored - it's computed from its
  // `template` property (see modules/variables/service.ts). Surfaced here as
  // two synthetic keys (rather than a change to the generic property/value
  // system) so the object detail page can show it like any other value.
  if (await isVariableObjectType(row.objectTypeId)) {
    const { value, error } = await getVariableValue(objectId);
    resolved.computedValue = toPropertyValue(value);
    resolved.computedValueError = error;
  }

  return toRecord(row, resolved);
}

export async function updateObject(
  objectId: string,
  input: UpdateObjectInput,
  actor?: { actorId: string; actorName: string },
): Promise<ObjectRecord> {
  const existing = await db.select().from(objects).where(eq(objects.id, objectId)).limit(1);
  const row = existing[0];
  if (!row) throw notFound("Object not found");

  if (input.title !== undefined && (await isVariableObjectType(row.objectTypeId))) {
    await assertVariableNameAvailable(row.workspaceId, input.title, objectId);
  }

  const patch: Partial<typeof objects.$inferInsert> = { updatedAt: nowIso() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.cover !== undefined) patch.cover = input.cover;
  if (input.coverTextStyle !== undefined) patch.coverTextStyle = input.coverTextStyle ? JSON.stringify(input.coverTextStyle) : null;
  if (input.slug !== undefined) {
    if (input.slug) await assertObjectSlugAvailable(row.workspaceId, input.slug, objectId);
    patch.slug = input.slug;
  }

  await db.update(objects).set(patch).where(eq(objects.id, objectId));

  if (input.values && Object.keys(input.values).length > 0) {
    await writeStoredValues(objectId, row.objectTypeId, row.workspaceId, input.title ?? row.title, input.values, actor);
  }

  await reindexObjectBody(objectId, input.title ?? row.title);
  return getObject(objectId);
}

/** Text/long-text value, JSON-parsed back to a raw string - `""` for anything else (absent, non-string, etc). Only these property types carry free text a `@[Name](user:id)` mention can appear in. */
function textValueOf(rawJson: string | undefined): string {
  if (!rawJson) return "";
  try {
    const parsed: unknown = JSON.parse(rawJson);
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}

/** Property types whose value is free text a `@[Name](user:id)` mention could appear in - just "text" today (there's no separate "longtext"/multiline property type in this codebase, see constants/propertyTypes.ts). */
const MENTIONABLE_PROPERTY_TYPES = new Set(["text"]);

async function writeStoredValues(
  objectId: string,
  objectTypeId: string,
  workspaceId: string,
  objectTitle: string,
  values: Record<string, unknown>,
  actor?: { actorId: string; actorName: string },
): Promise<void> {
  const props = await listProperties(objectTypeId);
  const propertyByKey = new Map(props.map((p) => [p.key, p]));

  for (const [key, value] of Object.entries(values)) {
    const property = propertyByKey.get(key);
    if (!property || ["relation", "formula", "rollup"].includes(property.type)) continue;

    let previousRawValue: string | undefined;
    if (actor && MENTIONABLE_PROPERTY_TYPES.has(property.type)) {
      const existing = await db
        .select({ value: objectValues.value })
        .from(objectValues)
        .where(and(eq(objectValues.objectId, objectId), eq(objectValues.propertyId, property.id)))
        .limit(1);
      previousRawValue = existing[0]?.value ?? undefined;
    }

    await db
      .insert(objectValues)
      .values({ objectId, propertyId: property.id, value: JSON.stringify(value) })
      .onConflictDoUpdate({
        target: [objectValues.objectId, objectValues.propertyId],
        set: { value: JSON.stringify(value) },
      });

    if (actor && MENTIONABLE_PROPERTY_TYPES.has(property.type)) {
      const previousText = textValueOf(previousRawValue);
      const nextText = textValueOf(JSON.stringify(value));
      if (nextText !== previousText) {
        // Best-effort: an @mention notification failing must never block
        // saving the property value itself.
        notifyMentionedUsers({
          workspaceId,
          objectId,
          objectTitle,
          actorId: actor.actorId,
          actorName: actor.actorName,
          source: "mention-field",
          previousText,
          nextText,
          fieldKey: property.key,
        }).catch(() => {});
      }
    }
  }
}

/** True if this object is currently set as its own workspace's dashboard - the one object a
 * workspace can never be left without (see workspaces/routes.ts's PATCH handler). Checked by
 * both archiveObject and deleteObject below, since archiving makes an object just as
 * unreachable via normal navigation as deleting it does. */
async function isWorkspaceDashboard(objectId: string): Promise<boolean> {
  const workspaceId = await getObjectWorkspaceId(objectId);
  const rows = await db
    .select({ dashboardObjectId: workspaces.dashboardObjectId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return rows[0]?.dashboardObjectId === objectId;
}

export async function archiveObject(objectId: string): Promise<void> {
  if (await isWorkspaceDashboard(objectId)) throw badRequest("Cannot archive the workspace dashboard object");
  await db.update(objects).set({ archivedAt: nowIso() }).where(eq(objects.id, objectId));
}

export async function restoreObject(objectId: string): Promise<void> {
  await db.update(objects).set({ archivedAt: null }).where(eq(objects.id, objectId));
}

export async function deleteObject(objectId: string): Promise<void> {
  if (await isWorkspaceDashboard(objectId)) throw badRequest("Cannot delete the workspace dashboard object");

  // Uploaded files aren't foreign-keyed to their object (their `objectId`
  // column is a plain string, not a reference) so deleting the object row
  // wouldn't touch them - list them first, while we still can, so the ones
  // that belonged only to this object (and their bytes on disk) get cleaned
  // up too instead of turning into permanent orphans.
  const orphanedFiles = await listFilesForObject(objectId);

  // Blocks, object_values and relations (both as source and as target) are
  // all foreign-keyed to `objects.id` with `onDelete: cascade`, so this one
  // delete already removes the object's own content and unlinks it from
  // every other object that referenced it - no separate cleanup needed there.
  await db.delete(objects).where(eq(objects.id, objectId));
  removeFromIndex(objectId);

  await Promise.all(orphanedFiles.map((file) => deleteFile(file.id)));
}

export interface QueryObjectsOptions {
  objectTypeId?: string;
  archived: boolean;
  filters?: ViewFilter[];
  sorts?: ViewSort[];
  cursor?: string;
  limit: number;
}

export interface QueryObjectsResult {
  items: ObjectRecord[];
  nextCursor: string | null;
}

/** Shared query engine used by both the plain object list endpoint and saved views. */
export async function queryObjects(
  workspaceId: string,
  options: QueryObjectsOptions,
): Promise<QueryObjectsResult> {
  const conditions = [
    eq(objects.workspaceId, workspaceId),
    options.archived ? isNotNull(objects.archivedAt) : isNull(objects.archivedAt),
  ];
  if (options.objectTypeId) conditions.push(eq(objects.objectTypeId, options.objectTypeId));

  const rows = await db
    .select()
    .from(objects)
    .where(and(...conditions))
    .orderBy(desc(objects.updatedAt))
    .limit(MAX_SCAN);

  if (rows.length === 0) return { items: [], nextCursor: null };

  const propsByType = new Map<string, Awaited<ReturnType<typeof listProperties>>>();
  for (const row of rows) {
    if (!propsByType.has(row.objectTypeId)) {
      propsByType.set(row.objectTypeId, await listProperties(row.objectTypeId));
    }
  }

  const objectIds = rows.map((r) => r.id);
  const allProps = [...propsByType.values()].flat();
  const valuesByObject = await resolveValuesForObjects(objectIds, allProps);

  let records = rows.map((row) => toRecord(row, valuesByObject.get(row.id) ?? {}));

  if (options.filters && options.filters.length > 0) {
    const props = propsByType.get(rows[0]!.objectTypeId) ?? allProps;
    const keyByPropertyId = new Map(props.map((p) => [p.id, p.key]));
    records = records.filter((r) => applyFilters(r.values, options.filters!, keyByPropertyId));
  }

  if (options.sorts && options.sorts.length > 0) {
    const props = propsByType.get(rows[0]!.objectTypeId) ?? allProps;
    const keyByPropertyId = new Map(props.map((p) => [p.id, p.key]));
    records = [...records].sort((a, b) => compareForSort(a.values, b.values, options.sorts!, keyByPropertyId));
  }

  const offset = options.cursor ? Number(options.cursor) || 0 : 0;
  const page = records.slice(offset, offset + options.limit);
  const nextCursor = offset + options.limit < records.length ? String(offset + options.limit) : null;

  return { items: page, nextCursor };
}

export async function createRelation(
  workspaceId: string,
  input: CreateRelationInput,
): Promise<Relation> {
  const id = newId();
  const createdAt = nowIso();
  await db
    .insert(relations)
    .values({
      id,
      workspaceId,
      propertyId: input.propertyId,
      sourceObjectId: input.sourceObjectId,
      targetObjectId: input.targetObjectId,
      createdAt,
    })
    .onConflictDoNothing();

  return { id, workspaceId, propertyId: input.propertyId, sourceObjectId: input.sourceObjectId, targetObjectId: input.targetObjectId, createdAt };
}

export async function deleteRelation(relationId: string, context: EditableContext): Promise<void> {
  // Route only has the relation's own id, not the source object's - looked
  // up here so the lock check (see assertObjectEditable) has something to
  // check against.
  const rows = await db.select({ sourceObjectId: relations.sourceObjectId }).from(relations).where(eq(relations.id, relationId)).limit(1);
  if (rows[0]) await assertObjectEditable(rows[0].sourceObjectId, context);
  await db.delete(relations).where(eq(relations.id, relationId));
}

/**
 * Deletes a relation by its (property, source, target) triple. The API only
 * ever hands clients the *target object ids* for a relation property (see
 * `resolveValuesForObjects`), never the relation row's own id, so unlinking
 * from the property editor goes through this instead of `deleteRelation`.
 */
export async function deleteRelationByTriple(
  propertyId: string,
  sourceObjectId: string,
  targetObjectId: string,
): Promise<void> {
  await db
    .delete(relations)
    .where(
      and(
        eq(relations.propertyId, propertyId),
        eq(relations.sourceObjectId, sourceObjectId),
        eq(relations.targetObjectId, targetObjectId),
      ),
    );
}

/** Objects that link *to* this object (regardless of which relation property was used). */
export async function listBacklinks(objectId: string): Promise<ObjectRecord[]> {
  const rows = await db.select().from(relations).where(eq(relations.targetObjectId, objectId));
  const sourceIds = [...new Set(rows.map((r) => r.sourceObjectId))];

  const results: ObjectRecord[] = [];
  for (const id of sourceIds) {
    results.push(await getObject(id));
  }
  return results;
}

/**
 * `rootObjectId` plus every object transitively reachable from it via
 * outgoing relations (any property) - includes `sub_objects` relations,
 * which `blocks/service.ts`'s `syncSubObjectRelation` keeps in lockstep with
 * `SubObjectContent` blocks, so this doubles as "everything embedded/linked
 * inline in this object's content, recursively" without needing to parse
 * block content directly. Used to let a single-object share link cascade
 * into whatever it links to (see `shareLinks/service.ts`'s
 * `assertShareCanAccessObject` and `workspaces/access.ts`'s `requireAccess`).
 * Cycle-safe via the visited set.
 */
export async function resolveReachableObjectIds(rootObjectId: string): Promise<Set<string>> {
  const visited = new Set<string>([rootObjectId]);
  const queue = [rootObjectId];

  while (queue.length) {
    const current = queue.shift()!;
    const rows = await db
      .select({ targetObjectId: relations.targetObjectId })
      .from(relations)
      .where(eq(relations.sourceObjectId, current));
    for (const row of rows) {
      if (!visited.has(row.targetObjectId)) {
        visited.add(row.targetObjectId);
        queue.push(row.targetObjectId);
      }
    }
  }

  return visited;
}
