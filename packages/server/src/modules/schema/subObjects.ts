import { db } from "../../db/client.js";
import { properties } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";

export const SUB_OBJECTS_PROPERTY_KEY = "sub_objects";

/**
 * Every object type gets this relation property so any object can have child
 * "sub-objects" of any type, regardless of what other properties that type
 * defines (unlike Task's parent_task, which only links other Tasks). Called
 * both when seeding the system types for a new workspace and when a user
 * creates a custom object type - see migrations/0004_universal_sub_objects.sql
 * for backfilling object types that already existed before this shipped.
 */
export async function createSubObjectsProperty(workspaceId: string, objectTypeId: string): Promise<void> {
  await db.insert(properties).values({
    id: newId(),
    workspaceId,
    objectTypeId,
    key: SUB_OBJECTS_PROPERTY_KEY,
    name: "Sub-objects",
    type: "relation",
    config: JSON.stringify({ type: "relation", targetObjectTypeId: null, twoWay: true }),
    position: 9999,
    createdAt: nowIso(),
  });
}
