import { sqliteTable, text, integer, real, primaryKey, unique } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatarColor: text("avatar_color").notNull().default("#6366f1"),
  // Set once the user uploads a profile picture (see modules/users/) - a
  // servable URL/path, not raw bytes. `avatarColor` stays the fallback
  // used everywhere this is null/unset.
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
  totpBackupCodes: text("totp_backup_codes"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const pendingTotpChallenges = sqliteTable("pending_totp_challenges", {
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
  weekStartsOn: text("week_starts_on").notNull().default("monday").$type<"sunday" | "monday">(),
  coverHeight: integer("cover_height").notNull().default(300),
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
  coverTextStyle: text("cover_text_style"),
  // Human-assignable, unique per workspace - lets templates (modules/templates/) address this
  // object by a stable name instead of its UUID. Null until the user (or the auto-generated
  // default at creation) sets one - see objects/service.ts's `generateSlug`.
  slug: text("slug"),
  // Owner-only kill-switch for the comments feature (modules/comments/) -
  // independent of lockedAt, so comments stay postable on a locked object
  // unless this is also set. Defaults to true (disabled) - see
  // objects/service.ts's `createObject`, which sets this explicitly rather
  // than relying on the column's own SQL default (still `0` at the SQL
  // level for historical reasons, see migrations/0030_notifications.sql).
  commentsDisabled: integer("comments_disabled", { mode: "boolean" }).notNull().default(true),
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
  // Human-assignable, unique per object - lets templates (modules/templates/) address this block
  // as `blocks.<slug>` instead of its UUID. Same pattern as objects.slug above.
  slug: text("slug"),
});

export const voteRecords = sqliteTable(
  "vote_records",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    // A user id for logged-in members, or a client-generated visitor id for
    // anonymous share-link visitors (see web's lib/visitorIdentity.ts) -
    // there's no server-side identity for the latter otherwise (see
    // workspaces/access.ts's `resolveActor`), so the client supplies one.
    voterKey: text("voter_key").notNull(),
    value: text("value").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.blockId, table.itemId, table.voterKey)],
);

// One row per comment on an object - see modules/comments/. `authorId` is
// nullable (ON DELETE SET NULL) so a comment survives its author's account
// being deleted; `authorName` is denormalized at write time for the same
// reason as `blockHistory.actorName`, and doubles as the anonymous
// share-visitor label when `authorId` is null (see workspaces/access.ts's
// `resolveActor`). `deletedAt`/`deletedByName` implement moderation deletes
// as a tombstone instead of a row removal - see migrations/0029_comments.sql.
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectId: text("object_id")
    .notNull()
    .references(() => objects.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  deletedByName: text("deleted_by_name"),
});

// One row per notification delivered to a registered user's bell - see
// modules/notifications/. `commentId` cascades with its comment (see
// migrations/0030_notifications.sql); `objectTitle`/`actorName` are
// denormalized at write time so a notification still reads correctly even
// after the object is renamed or the actor's account is gone.
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectId: text("object_id")
    .notNull()
    .references(() => objects.id, { onDelete: "cascade" }),
  objectTitle: text("object_title").notNull(),
  commentId: text("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  actorName: text("actor_name").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  readAt: text("read_at"),
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

export const shareInboxItems = sqliteTable("share_inbox_items", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // 'url' | 'text' | 'files'
  url: text("url"),
  title: text("title"),
  sharedText: text("shared_text"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const shareInboxFiles = sqliteTable("share_inbox_files", {
  id: text("id").primaryKey(),
  inboxItemId: text("inbox_item_id")
    .notNull()
    .references(() => shareInboxItems.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  storagePath: text("storage_path").notNull(),
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

export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  // AES-256-GCM encrypted at rest (lib/crypto.ts) - decrypted only to sign an
  // outbound delivery's HMAC, same pattern as users.totp_secret.
  secret: text("secret").notNull(),
  // JSON array of WebhookEvent strings (see @notorious/shared).
  events: text("events").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  lastTriggeredAt: text("last_triggered_at"),
  lastStatus: text("last_status").$type<"success" | "failure" | null>(),
  lastError: text("last_error"),
});

// Singleton row (id is always 1, enforced at the SQL level in the migration)
// for instance-wide settings - just registration for now, but a real table
// rather than an env var so it can be toggled live via a script (see
// scripts/setRegistration.ts) without editing .env/restarting the server.
export const instanceSettings = sqliteTable("instance_settings", {
  id: integer("id").primaryKey(),
  registrationEnabled: integer("registration_enabled", { mode: "boolean" }).notNull().default(false),
  require2faEnabled: integer("require_2fa_enabled", { mode: "boolean" }).notNull().default(false),
  allowTemplateHttpRequests: integer("allow_template_http_requests", { mode: "boolean" }).notNull().default(false),
  // Off by default - calls need MEDIA_ANNOUNCED_IP/MEDIA_PORT configured and
  // that port forwarded. See scripts/setupCalls.ts, which flips this on only
  // after that's confirmed.
  callsEnabled: integer("calls_enabled", { mode: "boolean" }).notNull().default(false),
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

// One active AI provider profile per user (not per workspace - same "global,
// user-owned secret" shape as apiKeys) - see modules/ai/service.ts.
export const aiConfigs = sqliteTable("ai_configs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().$type<"openai" | "anthropic" | "google" | "openai-compatible">(),
  // Only set for 'openai-compatible' (e.g. a local Ollama server's URL).
  baseUrl: text("base_url"),
  model: text("model").notNull(),
  // AES-256-GCM encrypted at rest (lib/crypto.ts), same as totp_secret/webhooks.secret.
  apiKey: text("api_key").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// One row per workspace, created lazily on first access - holds the AES-256
// key used to encrypt that workspace's backups. `encryptedKey` is the raw
// key wrapped with lib/crypto.ts (server master secret), decrypted only to
// show it in Settings or to encrypt/decrypt an actual backup ZIP.
export const workspaceBackupKeys = sqliteTable("workspace_backup_keys", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: text("created_at").notNull(),
});

export const backupDestinations = sqliteTable("backup_destinations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<"local" | "sftp" | "ftp" | "samba">(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  retentionCount: integer("retention_count").notNull().default(7),
  // Type-specific non-secret fields (host, port, username, remotePath, ...) as JSON.
  config: text("config").notNull().default("{}"),
  // The destination's password/credential, individually encrypted with lib/crypto.ts - null for 'local'.
  encryptedCredential: text("encrypted_credential"),
  // SFTP trust-on-first-use fingerprint of the server's host key, set after the first successful connection.
  hostKeyFingerprint: text("host_key_fingerprint"),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status").$type<"success" | "failure" | null>(),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// One row per workspace (id = workspaceId) describing its recurring backup
// job - see modules/backup/scheduler.ts. `anchorWeekStart` is the Monday
// (ISO date) the schedule was last saved on; `intervalWeeks` counts active
// weeks from that anchor, so "every 2 weeks" always lands on predictable weeks
// regardless of when the schedule was created or edited.
export const backupSchedules = sqliteTable("backup_schedules", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // JSON array of 0 (Sunday) - 6 (Saturday).
  weekdays: text("weekdays").notNull(),
  time: text("time").notNull(),
  // IANA name (e.g. "Europe/Berlin") the user's browser was in when `time` was set - `time` is that zone's local wall clock, not UTC.
  timezone: text("timezone").notNull().default("UTC"),
  intervalWeeks: integer("interval_weeks").notNull().default(1),
  anchorWeekStart: text("anchor_week_start").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  nextRunAt: text("next_run_at"),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status").$type<"success" | "failure" | null>(),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiChatMessages = sqliteTable("ai_chat_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"user" | "assistant" | "tool">(),
  content: text("content"),
  // JSON array of the assistant's tool calls for this message, if any.
  toolCalls: text("tool_calls"),
  // Only set on a role='tool' message - which assistant tool call this is the result of.
  toolCallId: text("tool_call_id"),
  createdAt: text("created_at").notNull(),
});

// A chat conversation - either a workspace_channel (workspaceId set, open to
// any workspace member) or a dm (workspaceId null, workspace-agnostic 1:1 or
// free-form group of registered users) - see modules/chat/service.ts.
// lastMessageAt is denormalized (bumped on every send) so the unified
// conversation list can sort by activity without a join+aggregate.
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull().$type<"workspace_channel" | "dm">(),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  lastMessageAt: text("last_message_at"),
});

// lastReadMessageId is a cheap per-participant "read up to here" cursor,
// driving both unread counts and the app-icon badge without scanning
// messageReadReceipts. See messageReadReceipts below for why that table
// still exists separately (per-message read-receipt UI).
export const conversationParticipants = sqliteTable(
  "conversation_participants",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull(),
    lastReadMessageId: text("last_read_message_id"),
  },
  (table) => [primaryKey({ columns: [table.conversationId, table.userId] })],
);

// deletedAt is a soft-delete (own messages only, see chat/service.ts) - the
// row is kept for thread ordering/read-receipt integrity, the DTO mapper
// nulls out body/attachments once set.
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  deletedAt: text("deleted_at"),
  // Set only on a call-outcome system row (see chat/calls/service.ts) -
  // `body` still carries a human-readable fallback ("Call ended - 3:21")
  // for anything that renders messages without knowing about calls; the
  // frontend special-cases callId != null into a compact call-log row
  // instead of a normal bubble (see MessageBubble.tsx).
  callId: text("call_id").references(() => calls.id),
});

// One row per call attempt - created when someone starts a call ("ringing"),
// transitions to "active" on the first accept (regardless of how many more
// people join afterward), and to "ended"/"missed"/"declined" as a terminal
// state. participantIds is denormalized JSON (not a join table) since call
// history is read-only display only ("Alice, Bob missed a call"), never
// queried per-participant - a normalized table would be pure overhead for a
// <=6-person, append-only list. See chat/calls/service.ts and
// chat/calls/callState.ts (the actual live source of truth for "who's in
// the call right now" while it's in progress - this row only gets written
// at transition points, not per-heartbeat).
export const calls = sqliteTable("calls", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  initiatorId: text("initiator_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().$type<"ringing" | "active" | "ended" | "missed" | "declined">(),
  startedAt: text("started_at").notNull(),
  answeredAt: text("answered_at"),
  endedAt: text("ended_at"),
  participantIds: text("participant_ids").notNull().default("[]"),
});

// messageId starts null - attachments are uploaded before the message they'll
// belong to exists (see chat/service.ts::sendMessage), then linked by id via
// the send request's attachmentIds. conversationId is denormalized so a
// pending (unlinked) upload can still be scoped/authorized without a message
// row to join through.
export const messageAttachments = sqliteTable("message_attachments", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const messageReactions = sqliteTable(
  "message_reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId, table.emoji] })],
);

// Kept separate from conversationParticipants.lastReadMessageId (which drives
// unread counts/the badge cheaply) because per-message "who has read this"
// (receipt avatars, iMessage-style) can't be cleanly derived from a single
// cursor comparison across participants who may have joined at different
// times.
export const messageReadReceipts = sqliteTable(
  "message_read_receipts",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: text("read_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.userId] })],
);
