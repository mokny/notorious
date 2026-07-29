import { eq, and } from "drizzle-orm";
import type {
  CreateObjectTypeInput,
  CreatePropertyInput,
  UpdatePropertyInput,
  ObjectType,
  Property,
  PropertyConfig,
  PropertyType,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import { objectTypes, properties } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, notFound } from "../../lib/httpError.js";

/**
 * The `type` field is stored redundantly inside the JSON `config` blob (as the
 * discriminant of `PropertyConfig`) so every reader - formula/rollup
 * evaluation, the frontend property editors - can branch on `config.type`
 * without a second lookup. Zod only validates the config's shape, not this
 * discriminant, so it is stamped on here rather than trusted from the caller.
 */
function withTypeTag(type: PropertyType, config: Record<string, unknown>): PropertyConfig {
  return { ...config, type } as PropertyConfig;
}

function toProperty(row: typeof properties.$inferSelect): Property {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    objectTypeId: row.objectTypeId,
    key: row.key,
    name: row.name,
    type: row.type as Property["type"],
    config: JSON.parse(row.config),
    position: row.position,
  };
}

export async function listObjectTypes(workspaceId: string): Promise<ObjectType[]> {
  return db
    .select({
      id: objectTypes.id,
      workspaceId: objectTypes.workspaceId,
      key: objectTypes.key,
      name: objectTypes.name,
      icon: objectTypes.icon,
      isSystem: objectTypes.isSystem,
    })
    .from(objectTypes)
    .where(eq(objectTypes.workspaceId, workspaceId));
}

export async function createObjectType(
  workspaceId: string,
  input: CreateObjectTypeInput,
): Promise<ObjectType> {
  const existing = await db
    .select()
    .from(objectTypes)
    .where(and(eq(objectTypes.workspaceId, workspaceId), eq(objectTypes.key, input.key)))
    .limit(1);
  if (existing[0]) throw badRequest(`An object type with key "${input.key}" already exists`);

  const id = newId();
  await db.insert(objectTypes).values({
    id,
    workspaceId,
    key: input.key,
    name: input.name,
    icon: input.icon,
    isSystem: false,
    createdAt: nowIso(),
  });

  return { id, workspaceId, key: input.key, name: input.name, icon: input.icon, isSystem: false };
}

export async function deleteObjectType(workspaceId: string, objectTypeId: string): Promise<void> {
  const rows = await db
    .select()
    .from(objectTypes)
    .where(and(eq(objectTypes.id, objectTypeId), eq(objectTypes.workspaceId, workspaceId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound("Object type not found");
  if (row.isSystem) throw badRequest("System object types cannot be deleted");

  await db.delete(objectTypes).where(eq(objectTypes.id, objectTypeId));
}

export async function listProperties(objectTypeId: string): Promise<Property[]> {
  const rows = await db
    .select()
    .from(properties)
    .where(eq(properties.objectTypeId, objectTypeId))
    .orderBy(properties.position);
  return rows.map(toProperty);
}

export async function getProperty(propertyId: string): Promise<Property> {
  const rows = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Property not found");
  return toProperty(row);
}

export async function createProperty(
  workspaceId: string,
  input: CreatePropertyInput,
): Promise<Property> {
  const existing = await db
    .select()
    .from(properties)
    .where(and(eq(properties.objectTypeId, input.objectTypeId), eq(properties.key, input.key)))
    .limit(1);
  if (existing[0]) throw badRequest(`A property with key "${input.key}" already exists on this type`);

  const id = newId();
  const createdAt = nowIso();
  const config = withTypeTag(input.type, input.config);

  await db.insert(properties).values({
    id,
    workspaceId,
    objectTypeId: input.objectTypeId,
    key: input.key,
    name: input.name,
    type: input.type,
    config: JSON.stringify(config),
    position: input.position,
    createdAt,
  });

  return {
    id,
    workspaceId,
    objectTypeId: input.objectTypeId,
    key: input.key,
    name: input.name,
    type: input.type,
    config,
    position: input.position,
  };
}

export async function updateProperty(
  propertyId: string,
  input: UpdatePropertyInput,
): Promise<Property> {
  const patch: Partial<typeof properties.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.config !== undefined) {
    const existing = await getProperty(propertyId);
    patch.config = JSON.stringify(withTypeTag(existing.type, input.config));
  }
  if (input.position !== undefined) patch.position = input.position;

  await db.update(properties).set(patch).where(eq(properties.id, propertyId));
  return getProperty(propertyId);
}

export async function deleteProperty(propertyId: string): Promise<void> {
  await db.delete(properties).where(eq(properties.id, propertyId));
}
