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

/**
 * Display order for object-type pickers (browse-objects menu, sub-object
 * menu, slash command), ranked by how frequently most users create/use each
 * type - not alphabetical and not the seed order above. Types not listed here
 * (custom, workspace-defined ones) sort after these, alphabetically - see
 * `sortObjectTypesForDisplay`.
 */
export const OBJECT_TYPE_DISPLAY_ORDER: readonly SystemObjectTypeKey[] = [
  "note",
  "task",
  "project",
  "meeting",
  "person",
  "company",
  "book",
  "file",
  "collection",
  "database",
  "whiteboard",
];

/**
 * Sorts object types for display: system types first in
 * `OBJECT_TYPE_DISPLAY_ORDER`, then any other (custom) types alphabetically
 * by name. Shared by every object-type picker so ordering stays consistent.
 */
export function sortObjectTypesForDisplay<T extends { key: string; name: string }>(types: readonly T[]): T[] {
  const priority = new Map<string, number>(OBJECT_TYPE_DISPLAY_ORDER.map((key, index) => [key, index]));
  return types.slice().sort((a, b) => {
    const pa = priority.get(a.key);
    const pb = priority.get(b.key);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}
