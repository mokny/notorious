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
