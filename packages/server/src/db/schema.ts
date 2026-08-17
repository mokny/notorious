import { sqliteTable, text, integer, real, primaryKey, unique, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Null for a passkey-only account (see modules/auth/service.ts's `registerUserWithPasskey`) -
  // every password-checking code path (login, changePassword, changeEmail, reverifyWithPassword,
  // 2FA disable) explicitly branches on this being null instead of assuming a password exists.
  passwordHash: text("password_hash"),
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
  // Whether Web Push should still show an OS notification when the user
  // already has a tab focused/visible - see push/service.ts::notifyUser and
  // push-sw.ts. Defaults to showing them anyway.
  pushShowWhenOpen: integer("push_show_when_open", { mode: "boolean" }).notNull().default(true),
  // Preferred UI/push-notification language (an @notorious/shared
  // SUPPORTED_LOCALES code) - null until set via Settings or AuthContext.tsx's
  // one-time browser-language detection. Null means "render in the
  // default/English fallback", not "unset".
  locale: text("locale"),
  // Content-area font-size preference (percent, 80-150) - the block editor
  // and views scale text by this, separately for phone vs tablet/desktop
  // viewports (see hooks/useBreakpoint.ts and lib/contentFontScale.ts).
  contentFontSizeMobile: integer("content_font_size_mobile").notNull().default(100),
  contentFontSizeDesktop: integer("content_font_size_desktop").notNull().default(100),
  // Instance-wide admin role (see modules/admin/) - a single boolean, not a
  // multi-level role, since instance administration is all-or-nothing. The
  // first-ever registered account gets this automatically (see
  // modules/auth/service.ts's `registerUser`); scripts/makeAdmin.ts and the
  // admin UI itself are the other two ways to grant/revoke it.
  isServerAdmin: integer("is_server_admin", { mode: "boolean" }).notNull().default(false),
  // Manually-set chat availability ("traffic light") - green (default) behaves
  // normally, yellow silences the client-side new-message sound only, red
  // additionally suppresses chat push and call push/live-ring. See
  // modules/chat/service.ts and modules/calls/service.ts for where each is
  // enforced, and hooks/useChatSound.ts on the client.
  chatStatus: text("chat_status").notNull().default("green").$type<"green" | "yellow" | "red">(),
  // Set every time a user's last `/ws/chat` socket closes (see
  // realtime/hub.ts's `onUserOnlineChange` listener in modules/chat/
  // service.ts) - null until they've ever disconnected once. Powers the
  // "last seen at HH:MM" line ThreadView.tsx shows under an offline
  // contact's name.
  lastSeenAt: text("last_seen_at"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  // Device-list fields (see plugins/session.ts's `listSessions`/`revokeSession`) - all backfilled
  // by migrations/0037_session_devices.sql for rows created before this existed.
  userAgent: text("user_agent"),
  ip: text("ip"),
  // Bumped (throttled, see RENEWAL_THROTTLE_MS in plugins/session.ts) on every authenticated
  // request - what makes a session "infinite" for an actively-used device: expiresAt keeps
  // rolling forward from this instead of counting down from a fixed login time.
  lastSeenAt: text("last_seen_at"),
  // Set to "now" by a successful POST /api/v1/auth/reverify (password or passkey) - see
  // modules/reverify/service.ts. Null (or older than SUDO_TTL_MS) means this session isn't
  // currently allowed to read/write a `requiresReverify` object; only ever set for a real
  // cookie session (see plugins/session.ts's `authMethod`), never for an API key.
  sudoVerifiedAt: text("sudo_verified_at"),
});

// One row per registered WebAuthn credential (passkey) - see modules/webauthn/. `credentialId` is
// the base64url authenticator credential id used to look up the row on login (unique - the same
// physical authenticator can never be registered against two accounts). `publicKey`/`counter` are
// exactly what @simplewebauthn/server's `verifyAuthenticationResponse` needs; `counter` guards
// against a cloned authenticator (bumped on every successful login, must only ever increase).
export const webauthnCredentials = sqliteTable("webauthn_credentials", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  // JSON array of AuthenticatorTransportFuture strings ("usb" | "nfc" | "ble" | "internal" | "hybrid"),
  // as reported at registration - passed back to the browser on login so it knows which transports
  // to try first. Optional per the WebAuthn spec, hence nullable.
  transports: text("transports"),
  // User-editable label ("MacBook Touch ID"), defaults to a generic name at registration time.
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
});

// Short-lived WebAuthn ceremony state (see @simplewebauthn/server's `generateRegistrationOptions`/
// `generateAuthenticationOptions`) - the `challenge` a browser's authenticator must sign, matched
// back up in `verifyRegistrationResponse`/`verifyAuthenticationResponse`. `userId` is null for a
// usernameless (conditional UI) login challenge, where the credential itself - not a prior login
// step - identifies the account; `purpose` distinguishes a normal login challenge from a reverify
// ("sudo mode") one, so a reverify ceremony can never be replayed to complete a full login instead.
// `pendingEmail`/`pendingName` are only set for a `"register-account"` challenge (brand-new,
// passkey-only signup, see modules/webauthn/service.ts's `generateRegistrationOptionsForNewAccount`)
// - there's no user row yet for `userId` to point at, so the challenge itself has to carry the
// email/name forward to the verify step instead.
export const webauthnChallenges = sqliteTable("webauthn_challenges", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  challenge: text("challenge").notNull(),
  purpose: text("purpose").notNull().$type<"register" | "login" | "reverify" | "register-account">(),
  pendingEmail: text("pending_email"),
  pendingName: text("pending_name"),
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
  // Auto-resize settings for uploaded images (see modules/files/imageResize.ts) - null means no
  // limit (the default, off until an admin opts in). Separate width/height pairs for normal
  // image uploads vs. cover images since they serve different purposes; imageQuality is a single
  // shared WebP re-encode quality applied whenever either pair actually triggers a resize.
  imageMaxWidth: integer("image_max_width"),
  imageMaxHeight: integer("image_max_height"),
  coverMaxWidth: integer("cover_max_width"),
  coverMaxHeight: integer("cover_max_height"),
  imageQuality: integer("image_quality").notNull().default(80),
  // Optional owner-set branding shown as a thin banner on object detail pages
  // (see components/CompanyBanner.tsx) - companyCover (if set) renders as a
  // plain image with no text; otherwise companyName (if set) renders as text
  // over companyBannerBackgroundColor. Owner-only to change (routes.ts's PATCH
  // handler gates these fields specifically), unlike the rest of this table.
  companyName: text("company_name"),
  companyCover: text("company_cover"),
  companyBannerHeight: integer("company_banner_height").notNull().default(50),
  companyBannerTextColor: text("company_banner_text_color"),
  companyBannerBackgroundColor: text("company_banner_background_color"),
  companyBannerBold: integer("company_banner_bold", { mode: "boolean" }).notNull().default(false),
  companyBannerItalic: integer("company_banner_italic", { mode: "boolean" }).notNull().default(false),
  companyBannerLetterSpacing: integer("company_banner_letter_spacing", { mode: "boolean" }).notNull().default(false),
  companyBannerTextAlign: text("company_banner_text_align").notNull().default("center").$type<"left" | "center" | "right">(),
  companyBannerFadeEnabled: integer("company_banner_fade_enabled", { mode: "boolean" }).notNull().default(true),
  companyBannerGradientEnabled: integer("company_banner_gradient_enabled", { mode: "boolean" }).notNull().default(false),
  companyBannerBackgroundColor2: text("company_banner_background_color_2"),
  companyBannerGradientAngle: integer("company_banner_gradient_angle").notNull().default(90),
  companyBannerGradientStartPosition: integer("company_banner_gradient_start_position").notNull().default(0),
  companyBannerTextShadow: integer("company_banner_text_shadow", { mode: "boolean" }).notNull().default(false),
  companyBannerFontFamily: text("company_banner_font_family").$type<"default" | "serif" | "sans-serif" | "monospace" | "cursive">(),
  companyBannerPosition: text("company_banner_position").notNull().default("below").$type<"above" | "below">(),
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
    // This user's personal position for this workspace in their own rail/picker
    // list - a fractional-indexing key (see lib/position.ts), not shared with
    // other members. Distinct from workspacePins.position, which is workspace-
    // wide.
    position: text("position").notNull(),
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
  // "Vault" reverify protection (see modules/reverify/) - the enforcement side lives in
  // workspaces/access.ts's `requireAccess`, checked for every object-scoped request
  // regardless of role (unlike `lockedAt`, which only ever blocks editor+ requests).
  requiresReverify: integer("requires_reverify", { mode: "boolean" }).notNull().default(false),
  // Owner-configurable access overrides - see migrations/0059_object_settings.sql
  // and objects/service.ts's `assertObjectEditable` for enforcement.
  ownerOnlyEdit: integer("owner_only_edit", { mode: "boolean" }).notNull().default(false),
  allowApiEditsOverride: integer("allow_api_edits_override", { mode: "boolean" }).notNull().default(false),
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
// after the object is renamed or the actor's account is gone. `source`/
// `blockId`/`fieldKey` were added by migrations/0047_mention_notifications.sql
// for real @mentions (see utils/mentions.ts) alongside the pre-existing
// "you're part of this comment thread" rows (`source: "comment"`).
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
  source: text("source").notNull().default("comment"),
  blockId: text("block_id").references(() => blocks.id, { onDelete: "cascade" }),
  fieldKey: text("field_key"),
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
  // Scheduled unattended self-update (see modules/admin/autoUpdateScheduler.ts) -
  // off by default. `autoUpdateTime` is a "HH:MM" 24h local-server-time string,
  // nullable until the admin picks one. `autoUpdateSudoPasswordEncrypted` is
  // only ever populated/read by the server (AES-256-GCM via
  // modules/admin/sudoCrypto.ts) - never returned to a client, see
  // modules/instanceSettings/service.ts's `getAutoUpdateSettings`, which only
  // exposes a `hasSudoPassword` boolean.
  autoUpdateEnabled: integer("auto_update_enabled", { mode: "boolean" }).notNull().default(false),
  autoUpdateChannel: text("auto_update_channel").notNull().default("nightly"),
  autoUpdateTime: text("auto_update_time"),
  autoUpdateSudoPasswordEncrypted: text("auto_update_sudo_password_encrypted"),
  // Rate-limits POST /api/v1/auth/login by IP when on - see
  // modules/admin/routes.ts's login rate-limit wiring. Off by default so
  // enabling it is an explicit admin opt-in, not a surprise for existing
  // instances after an upgrade.
  loginRateLimitEnabled: integer("login_rate_limit_enabled", { mode: "boolean" }).notNull().default(false),
  // Whether request.ip should be derived from X-Forwarded-For/X-Real-IP instead of the raw
  // socket peer address - see modules/instanceSettings/service.ts's getTrustProxyConfigSync,
  // consumed synchronously by app.ts's Fastify `trustProxy` function. Off by default: enabling
  // this without actually running behind the reverse proxy listed in trustProxyAddresses lets
  // any direct caller spoof their IP (login rate limiting, session/audit logs). See docs/NGINX.md.
  trustProxyEnabled: integer("trust_proxy_enabled", { mode: "boolean" }).notNull().default(false),
  // Comma-separated list of trusted proxy IPs/CIDRs (e.g. "127.0.0.1,172.18.0.0/16"). Required
  // (non-empty) for trustProxyEnabled to actually take effect - see getTrustProxyConfigSync.
  trustProxyAddresses: text("trust_proxy_addresses"),
});

// Append-only log of security-relevant admin actions - see modules/admin/service.ts's
// `logAdminAction`. `actorName` is denormalized (same reasoning as activityLog/blockHistory)
// so an entry still reads correctly after the acting admin's account is later deleted.
export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});

// History log of self-update attempts (manual admin-triggered or scheduled
// auto-update) - see modules/admin/autoUpdateScheduler.ts and
// modules/admin/routes.ts's `GET /api/v1/admin/update/history`. Text `id`
// via newId(), same convention as adminAuditLog above, rather than an
// autoincrement integer PK (no other table in this schema uses one).
// One row per failed login attempt (admin panel "Failed Logins" tab) - see
// modules/admin/service.ts's `recordFailedLogin`. `userId` is null when the
// attempted email doesn't belong to any account (still worth surfacing to an
// admin - enumeration/credential-stuffing against unknown addresses). Pruned
// to the last 30 days by a daily cron job (see
// modules/admin/failedLoginCleanup.ts) rather than kept forever.
export const failedLoginAttempts = sqliteTable(
  "failed_login_attempts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    reason: text("reason").notNull().$type<"unknown_email" | "wrong_password" | "no_password_set">(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_failed_login_attempts_user_id").on(table.userId), index("idx_failed_login_attempts_created_at").on(table.createdAt)],
);

export const updateRuns = sqliteTable("update_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  trigger: text("trigger").notNull(), // 'manual' | 'auto'
  channel: text("channel").notNull(), // 'nightly' | 'release'
  fromVersion: text("from_version").notNull(),
  toVersion: text("to_version"),
  status: text("status").notNull(), // 'success' | 'failure'
  errorMessage: text("error_message"),
});

// Admin-only, workspace-agnostic notification bell (see
// modules/admin/service.ts's `notifyAllAdmins`) - the `notifications` table
// above requires a `workspaceId`/`objectId`, which system-level events like
// an auto-update outcome don't have, hence this separate table.
export const adminNotifications = sqliteTable("admin_notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url").notNull(),
  createdAt: text("created_at").notNull(),
  readAt: text("read_at"),
});

// One row per (object, user) a member has explicitly opted into - see
// modules/subscriptions/. Purely explicit (no auto-subscribe on
// create/comment) - unlike notifyCommentParticipants' implicit "thread
// follower" model above, which stays independent of this table.
export const objectSubscriptions = sqliteTable(
  "object_subscriptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectId: text("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.objectId, table.userId), index("idx_object_subscriptions_user_id").on(table.userId)],
);

// One row per (object, subscriber) currently inside its debounce window -
// see modules/subscriptions/scheduler.ts. Every new activity on the object
// (recordAndBroadcast) bumps `dueAt` forward and `changeCount` up instead of
// inserting a new row, so a burst of edits collapses into a single delivered
// notification once the object goes quiet for the debounce window; the row
// is deleted once delivered.
export const pendingSubscriptionNotifications = sqliteTable(
  "pending_subscription_notifications",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectId: text("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastActorId: text("last_actor_id")
      .notNull()
      .references(() => users.id),
    changeCount: integer("change_count").notNull().default(1),
    dueAt: text("due_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.objectId, table.userId), index("idx_pending_subscription_notifications_due_at").on(table.dueAt)],
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

// One active AI provider profile per workspace, set by the workspace owner
// and shared by every member - see modules/ai/service.ts. Also tracks a
// rolling token budget that resets on `usageResetInterval`.
export const workspaceAiConfigs = sqliteTable("workspace_ai_configs", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().$type<"openai" | "anthropic" | "google" | "openai-compatible">(),
  // Only set for 'openai-compatible' (e.g. a local Ollama server's URL).
  baseUrl: text("base_url"),
  model: text("model").notNull(),
  // AES-256-GCM encrypted at rest (lib/crypto.ts), same as totp_secret/webhooks.secret.
  apiKey: text("api_key").notNull(),
  // Null = unlimited.
  maxTokenBudget: integer("max_token_budget"),
  consumedTokens: integer("consumed_tokens").notNull().default(0),
  usageResetInterval: text("usage_reset_interval").notNull().default("monthly").$type<"hourly" | "daily" | "weekly" | "monthly">(),
  usageResetAt: text("usage_reset_at").notNull(),
  // Set once the owner has been notified that the budget was hit this cycle
  // - cleared on reset or on a config edit, so the notification fires once
  // per breach rather than on every subsequent blocked request.
  budgetNotifiedAt: text("budget_notified_at"),
  // Freeform "purpose & behavior" text an owner sets, appended to the agent's system prompt.
  purposeInstructions: text("purpose_instructions"),
  // How many of the user's own most-recent chat turns are sent to the model as context - see modules/ai/agent.ts's `limitHistory`. 0 = none, just the message just sent.
  chatHistoryLimit: integer("chat_history_limit").notNull().default(20),
  // Whether the chat-only `list_recent_activity` tool is available to the agent - off by default, never exposed via MCP.
  activityFeedEnabled: integer("activity_feed_enabled", { mode: "boolean" }).notNull().default(false),
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
  // No onDelete cascade - deleting the original must not cascade-delete the
  // reply, it should just lose its quoted preview (see chat/service.ts).
  replyToId: text("reply_to_id").references((): AnySQLiteColumn => messages.id),
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
// One row per (block, feed URL) subscribed to an rssFeed block - see
// modules/feeds/. A block may have up to MAX_FEED_SOURCES_PER_BLOCK of
// these (enforced in service.ts, not at the SQL level). `displayName` is a
// user override; `resolvedTitle` is the feed's own `<title>`, filled in
// after the first successful fetch - the UI prefers displayName, falling
// back to resolvedTitle, then the raw url (see toPublicFeedSource).
// `nextRunAt`/`lastRunAt`/`lastError` drive the once-a-minute poller
// (scheduler.ts), mirroring backupSchedules' own polling fields.
export const feedSources = sqliteTable(
  "feed_sources",
  {
    id: text("id").primaryKey(),
    blockId: text("block_id")
      .notNull()
      .references(() => blocks.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    displayName: text("display_name"),
    resolvedTitle: text("resolved_title"),
    // The source site's favicon (same extraction linkPreview uses for
    // bookmarks), resolved once on first successful fetch and then reused -
    // shown as a per-item fallback image when an item has no thumbnail.
    faviconUrl: text("favicon_url"),
    // User-chosen badge color (one of FEED_BADGE_COLORS), or null for "auto"
    // - see RssFeedBlock.tsx's colorFor for the auto-derivation.
    badgeColor: text("badge_color"),
    intervalMinutes: integer("interval_minutes").notNull(),
    nextRunAt: text("next_run_at").notNull(),
    lastRunAt: text("last_run_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_feed_sources_next_run_at").on(table.nextRunAt)],
);

// Cached items for one feed_source - refreshed by the scheduler, trimmed to
// the 50 most recent per source on every poll (see scheduler.ts). `guid` is
// the feed's own item guid/id, falling back to its link, used as the
// per-source dedup key on upsert.
export const feedItems = sqliteTable(
  "feed_items",
  {
    id: text("id").primaryKey(),
    feedSourceId: text("feed_source_id")
      .notNull()
      .references(() => feedSources.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    title: text("title").notNull(),
    link: text("link").notNull(),
    publishedAt: text("published_at"),
    descriptionText: text("description_text"),
    // Hotlinked directly (media:thumbnail/enclosure URL) - no server-side
    // download/proxy, same reasoning as BookmarkContent's favicon.
    imageUrl: text("image_url"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    unique().on(table.feedSourceId, table.guid),
    index("idx_feed_items_published_at").on(table.publishedAt),
  ],
);

// Instance-admin-granted permission for one (module, user, workspace) combo -
// see modules/moduleRegistry/. A user can only enable/use a module for a
// specific workspace once a server admin has explicitly allowed that exact
// combination here; there's no global "this user may use this module
// anywhere" shortcut - see modules/admin/moduleGrants.ts.
export const moduleInstanceGrants = sqliteTable(
  "module_instance_grants",
  {
    id: text("id").primaryKey(),
    moduleId: text("module_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.moduleId, table.userId, table.workspaceId)],
);

// Whether a module is switched on for a workspace - see
// modules/moduleRegistry/access.ts's `requireModuleAccess`. Requires a
// matching `moduleInstanceGrants` row for the enabling owner before it can be
// created (enforced in service.ts, not at the SQL level).
export const workspaceModules = sqliteTable(
  "workspace_modules",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    enabledBy: text("enabled_by")
      .notNull()
      .references(() => users.id),
    enabledAt: text("enabled_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.moduleId] })],
);

// One row per (module, member) permission string granted by the workspace
// owner - see modules/moduleRegistry/service.ts. The owner themselves never
// needs a row here (implicitly holds every permission a module declares,
// checked directly in `requireModuleAccess`).
export const workspaceModulePermissions = sqliteTable(
  "workspace_module_permissions",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    moduleId: text("module_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.moduleId, table.userId, table.permission] })],
);

// Tracks which of a module's own migrations/*.sql files have run - separate
// from the core `_migrations` table (see db/migrate.ts) so a module can ship
// and version its own schema independently of the core migration sequence.
// Runs at boot for every module found on disk, regardless of whether any
// workspace has actually enabled it yet - see modules/moduleRegistry/loader.ts.
export const moduleMigrations = sqliteTable(
  "module_migrations",
  {
    moduleId: text("module_id").notNull(),
    filename: text("filename").notNull(),
    appliedAt: text("applied_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.moduleId, table.filename] })],
);

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
