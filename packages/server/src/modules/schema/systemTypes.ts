import { SYSTEM_OBJECT_TYPES, type PropertyType, type PropertyConfig } from "@notorious/shared";
import { db } from "../../db/client.js";
import { objectTypes, properties } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";

function option(label: string, color: string): { id: string; label: string; color: string } {
  return { id: newId(), label, color };
}

interface PropertyBlueprint {
  key: string;
  name: string;
  type: PropertyType;
  config: PropertyConfig;
}

/** Sensible default properties seeded for each system object type. Users can add more. */
function defaultPropertiesFor(
  typeKey: string,
  typeIdByKey: Record<string, string>,
): PropertyBlueprint[] {
  switch (typeKey) {
    case "note":
      return [{ key: "tags", name: "Tags", type: "multi_tag", config: { type: "multi_tag", options: [] } }];
    case "project":
      return [
        {
          key: "status",
          name: "Status",
          type: "status",
          config: {
            type: "status",
            options: [
              option("Planning", "#94a3b8"),
              option("Active", "#3b82f6"),
              option("On Hold", "#f59e0b"),
              option("Completed", "#22c55e"),
            ],
          },
        },
        {
          key: "priority",
          name: "Priority",
          type: "select",
          config: {
            type: "select",
            options: [
              option("Low", "#94a3b8"),
              option("Medium", "#eab308"),
              option("High", "#ef4444"),
            ],
          },
        },
        { key: "deadline", name: "Deadline", type: "date", config: { type: "date" } },
      ];
    case "task":
      return [
        {
          key: "status",
          name: "Status",
          type: "status",
          config: {
            type: "status",
            options: [
              option("To Do", "#94a3b8"),
              option("In Progress", "#3b82f6"),
              option("Blocked", "#ef4444"),
              option("Done", "#22c55e"),
              option("Cancelled", "#64748b"),
            ],
          },
        },
        {
          key: "priority",
          name: "Priority",
          type: "select",
          config: {
            type: "select",
            options: [
              option("None", "#94a3b8"),
              option("Low", "#38bdf8"),
              option("Medium", "#eab308"),
              option("High", "#f97316"),
              option("Urgent", "#ef4444"),
            ],
          },
        },
        { key: "deadline", name: "Deadline", type: "datetime", config: { type: "datetime" } },
        { key: "reminder", name: "Reminder", type: "datetime", config: { type: "datetime" } },
        {
          key: "recurrence",
          name: "Recurrence",
          type: "select",
          config: {
            type: "select",
            options: [
              option("None", "#94a3b8"),
              option("Daily", "#3b82f6"),
              option("Weekly", "#8b5cf6"),
              option("Monthly", "#ec4899"),
              option("Yearly", "#f97316"),
            ],
          },
        },
        {
          key: "parent_task",
          name: "Parent Task",
          type: "relation",
          config: { type: "relation", targetObjectTypeId: typeIdByKey.task ?? null, twoWay: true },
        },
        {
          key: "project",
          name: "Project",
          type: "relation",
          config: { type: "relation", targetObjectTypeId: typeIdByKey.project ?? null, twoWay: true },
        },
      ];
    case "person":
      return [
        { key: "email", name: "Email", type: "email", config: { type: "email" } },
        { key: "phone", name: "Phone", type: "phone", config: { type: "phone" } },
        {
          key: "company",
          name: "Company",
          type: "relation",
          config: { type: "relation", targetObjectTypeId: typeIdByKey.company ?? null, twoWay: true },
        },
      ];
    case "book":
      return [
        { key: "author", name: "Author", type: "text", config: { type: "text" } },
        { key: "rating", name: "Rating", type: "rating", config: { type: "rating", max: 5 } },
        {
          key: "status",
          name: "Status",
          type: "select",
          config: {
            type: "select",
            options: [option("To Read", "#94a3b8"), option("Reading", "#3b82f6"), option("Read", "#22c55e")],
          },
        },
      ];
    case "meeting":
      return [
        { key: "date", name: "Date", type: "datetime", config: { type: "datetime" } },
        { key: "location", name: "Location", type: "text", config: { type: "text" } },
        {
          key: "attendees",
          name: "Attendees",
          type: "relation",
          config: { type: "relation", targetObjectTypeId: typeIdByKey.person ?? null, twoWay: true },
        },
      ];
    case "company":
      return [
        { key: "website", name: "Website", type: "url", config: { type: "url" } },
        { key: "industry", name: "Industry", type: "text", config: { type: "text" } },
      ];
    case "file":
      return [{ key: "attachment", name: "Attachment", type: "file", config: { type: "file" } }];
    default:
      return [];
  }
}

/** Creates the 10 built-in object types (and their default properties) for a new workspace. */
export async function seedSystemObjectTypes(workspaceId: string): Promise<void> {
  const createdAt = nowIso();
  const typeIdByKey: Record<string, string> = {};

  for (const type of SYSTEM_OBJECT_TYPES) {
    typeIdByKey[type.key] = newId();
  }

  await db.insert(objectTypes).values(
    SYSTEM_OBJECT_TYPES.map((type) => ({
      id: typeIdByKey[type.key]!,
      workspaceId,
      key: type.key,
      name: type.name,
      icon: type.icon,
      isSystem: true,
      createdAt,
    })),
  );

  const propertyRows = SYSTEM_OBJECT_TYPES.flatMap((type) =>
    defaultPropertiesFor(type.key, typeIdByKey).map((blueprint, index) => ({
      id: newId(),
      workspaceId,
      objectTypeId: typeIdByKey[type.key]!,
      key: blueprint.key,
      name: blueprint.name,
      type: blueprint.type,
      config: JSON.stringify(blueprint.config),
      position: index,
      createdAt,
    })),
  );

  if (propertyRows.length > 0) {
    await db.insert(properties).values(propertyRows);
  }
}
