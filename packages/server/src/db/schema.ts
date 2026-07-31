import { sqliteTable, text, integer, real, primaryKey, unique } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatarColor: text("avatar_color").notNull().default("#6366f1"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("sparkles"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  // Not a Drizzle-level `.references()` - `objects` itself references
  // `workspaces`, and a mutual cycle between the two breaks TypeScript's
  // inference for both table types. The actual foreign key (with
  // ON DELETE SET NULL) is still enforced at the SQL level, in the migration.
  dashboardObjectId: text("dashboard_object_id"),
  createdAt: text("created_at").notNull(),
});

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<"viewer" | "commenter" | "editor" | "owner">(),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const workspaceInvites = sqliteTable("workspace_invites", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().$type<"viewer" | "commenter" | "editor">(),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("pending").$type<"pending" | "accepted" | "revoked">(),
  createdAt: text("created_at").notNull(),
});

export const objectTypes = sqliteTable(
  "object_types",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default("file"),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.key)],
);

export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectTypeId: text("object_type_id")
      .notNull()
      .references(() => objectTypes.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    config: text("config").notNull().default("{}"),
    position: real("position").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.objectTypeId, table.key)],
);

export const objects = sqliteTable("objects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectTypeId: text("object_type_id")
    .notNull()
    .references(() => objectTypes.id),
  title: text("title").notNull().default("Untitled"),
  icon: text("icon"),
  cover: text("cover"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
  lockedAt: text("locked_at"),
  lockedBy: text("locked_by").references(() => users.id, { onDelete: "set null" }),
  scriptSource: text("script_source"),
  scriptEnabled: integer("script_enabled", { mode: "boolean" }).notNull().default(false),
  scriptLastRunAt: text("script_last_run_at"),
  scriptLastRunSuccess: integer("script_last_run_success", { mode: "boolean" }),
  scriptLastRunTrigger: text("script_last_run_trigger"),
  scriptLastRunDurationMs: integer("script_last_run_duration_ms"),
  scriptLastRunError: text("script_last_run_error"),
  scriptLastRunLog: text("script_last_run_log"),
});

export const objectValues = sqliteTable(
  "object_values",
  {
    objectId: text("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    value: text("value"),
  },
  (table) => [primaryKey({ columns: [table.objectId, table.propertyId] })],
);

export const relations = sqliteTable(
  "relations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    sourceObjectId: text("source_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    targetObjectId: text("target_object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.propertyId, table.sourceObjectId, table.targetObjectId)],
);

export const blocks = sqliteTable("blocks", {
  id: text("id").primaryKey(),
  objectId: text("object_id")
    .notNull()
    .references(() => objects.id, { onDelete: "cascade" }),
  parentBlockId: text("parent_block_id"),
  type: text("type").notNull(),
  content: text("content").notNull().default("{}"),
  position: text("position").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectId: text("object_id"),
  blockId: text("block_id"),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const views = sqliteTable("views", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectTypeId: text("object_type_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  config: text("config").notNull().default("{}"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const savedSearches = sqliteTable("saved_searches", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  query: text("query").notNull().default(""),
  filters: text("filters").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectId: text("object_id"),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Per-block edit history shown below Properties when a block is selected (see BlockHistoryPanel.tsx) - see migrations/0014_block_history.sql for why this is separate from activityLog. */
export const blockHistory = sqliteTable("block_history", {
  id: text("id").primaryKey(),
  blockId: text("block_id")
    .notNull()
    .references(() => blocks.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});

// Workspace-wide sidebar pins - a shared "quick navigation" list every
// member (and an anonymous workspace-share visitor - see workspaces/access.ts)
// sees the same version of, like the dashboard object rather than a personal
// per-user preference (an anonymous visitor has no account for a personal
// list to belong to). `position` is a fractional-indexing key, same scheme
// as `blocks.position` (see lib/position.ts) - reordering never requires
// rewriting sibling rows.
export const workspacePins = sqliteTable(
  "workspace_pins",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectId: text("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.objectId] })],
);

// Per-user, per-workspace "recently viewed" list - server-backed for the
// same cross-device reason as workspace_pins above. One row per object ever
// viewed; `viewedAt` gets bumped (upsert) on every open, and the API only
// ever returns the most recent few (see modules/workspaces/service.ts) -
// same "keep full history, limit at query time" approach as activityLog.
export const recentlyViewed = sqliteTable(
  "recently_viewed",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectId: text("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    viewedAt: text("viewed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId, table.objectId] })],
);

export const sentReminders = sqliteTable(
  "sent_reminders",
  {
    objectId: text("object_id").notNull(),
    propertyId: text("property_id").notNull(),
    reminderValue: text("reminder_value").notNull(),
    sentAt: text("sent_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.objectId, table.propertyId, table.reminderValue] })],
);

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // null = the whole workspace is shared; otherwise scoped to exactly this
  // one object. Not a Drizzle `.references()` - `objects` rows can outlive
  // or be deleted independently and the FK (ON DELETE CASCADE) is enforced
  // at the SQL level in the migration instead, same as `files.objectId`.
  objectId: text("object_id"),
  token: text("token").notNull().unique(),
  role: text("role").notNull().$type<"viewer" | "commenter" | "editor">(),
  expiresAt: text("expires_at"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

// Singleton row (id is always 1, enforced at the SQL level in the migration)
// for instance-wide settings - just registration for now, but a real table
// rather than an env var so it can be toggled live via a script (see
// scripts/setRegistration.ts) without editing .env/restarting the server.
export const instanceSettings = sqliteTable("instance_settings", {
  id: integer("id").primaryKey(),
  registrationEnabled: integer("registration_enabled", { mode: "boolean" }).notNull().default(false),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
});
