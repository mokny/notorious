/**
 * Built-in ("system") object types that are seeded into every workspace.
 * Workspaces may additionally define their own custom object types at runtime;
 * those are stored in the database, not enumerated here.
 */
export const SYSTEM_OBJECT_TYPE_KEYS = [
  "note",
  "project",
  "task",
  "person",
  "book",
  "meeting",
  "company",
  "file",
  "database",
  "collection",
  "whiteboard",
] as const;

export type SystemObjectTypeKey = (typeof SYSTEM_OBJECT_TYPE_KEYS)[number];

export interface SystemObjectTypeDefinition {
  key: SystemObjectTypeKey;
  name: string;
  icon: string;
}

export const SYSTEM_OBJECT_TYPES: readonly SystemObjectTypeDefinition[] = [
  { key: "note", name: "Note", icon: "file-text" },
  { key: "project", name: "Project", icon: "folder-kanban" },
  { key: "task", name: "Task", icon: "check-square" },
  { key: "person", name: "Person", icon: "user" },
  { key: "book", name: "Book", icon: "book" },
  { key: "meeting", name: "Meeting", icon: "calendar" },
  { key: "company", name: "Company", icon: "building" },
  { key: "file", name: "File", icon: "paperclip" },
  { key: "database", name: "Database", icon: "table" },
  { key: "collection", name: "Collection", icon: "layers" },
  { key: "whiteboard", name: "Whiteboard", icon: "whiteboard" },
];
