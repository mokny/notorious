import type { PropertyType, PropertyConfig } from "../constants/propertyTypes.js";
import type { BlockType } from "../constants/blockTypes.js";
import type { ViewType, ViewConfig } from "../constants/viewTypes.js";
import type { WorkspaceRole } from "../constants/roles.js";

/** ISO-8601 timestamp string, as returned by the API (SQLite stores these as TEXT). */
export type ISODateString = string;

export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  /** Set once the user uploads a profile picture (see modules/users/) - a servable URL/path. `avatarColor` is the fallback whenever this is null/unset. */
  avatarUrl?: string | null;
  createdAt: ISODateString;
  /** Whether TOTP two-factor authentication is set up and confirmed for this account (see modules/twoFactor/) - never exposes the secret itself, just this flag. */
  totpEnabled: boolean;
}

/**
 * A personal API key for programmatic access (`Authorization: Bearer <token>`).
 * The plaintext `token` is only ever present in the response to the create
 * call - after that, only the non-secret metadata below is retrievable.
 */
export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  createdAt: ISODateString;
  lastUsedAt: ISODateString | null;
}

export interface CreatedApiKey extends ApiKey {
  token: string;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  ownerId: string;
  /** The single object shown when opening this workspace, and linked as "Dashboard" in the nav - null until an owner/editor sets one. */
  dashboardObjectId: string | null;
  /** Which day Week/Month calendar views start on - a workspace-wide setting so every member's calendar block lines up the same way. */
  weekStartsOn: "sunday" | "monday";
  /** Max height (px, 50-300) object cover banners are cropped to in this workspace - see CoverImage.tsx. */
  coverHeight: number;
  /** Max pixel dimensions normal (non-cover) image uploads are downscaled to, null = no limit (default, off) - see modules/files/imageResize.ts. */
  imageMaxWidth: number | null;
  imageMaxHeight: number | null;
  /** Same as imageMaxWidth/imageMaxHeight but for cover-image uploads specifically. */
  coverMaxWidth: number | null;
  coverMaxHeight: number | null;
  /** WebP re-encode quality (1-100) applied whenever a resize above actually triggers - not used otherwise. */
  imageQuality: number;
  createdAt: ISODateString;
}

/** One logged-in device/browser for the current account - see plugins/session.ts's `listSessions`, shown in Settings > Security. */
export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: ISODateString;
  lastSeenAt: ISODateString | null;
  /** Whether this is the session the request listing it was itself made with. */
  isCurrent: boolean;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: ISODateString;
  user: User;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string;
  createdAt: ISODateString;
  status: "pending" | "accepted" | "revoked";
}

export interface ObjectType {
  id: string;
  workspaceId: string | null;
  key: string;
  name: string;
  icon: string;
  isSystem: boolean;
  /** See `SystemObjectTypeDefinition.blockInsertable` - derived, not stored. */
  blockInsertable: boolean;
}

export interface Property {
  id: string;
  workspaceId: string;
  objectTypeId: string;
  key: string;
  name: string;
  type: PropertyType;
  config: PropertyConfig;
  position: number;
}

/** The `{ start, end }` shape is only ever used by a "daterange" property (see propertyTypes.ts) - both "YYYY-MM-DD", no time component. */
export type PropertyValue = string | number | boolean | string[] | { start: string; end: string } | null;

export interface ObjectRecord {
  id: string;
  workspaceId: string;
  objectTypeId: string;
  title: string;
  icon: string | null;
  cover: string | null;
  createdBy: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  archivedAt: ISODateString | null;
  /** Set by the workspace owner (see objects/routes.ts's lock endpoint) - while set, nobody (including the owner) can edit this object until it's unlocked again. */
  lockedAt: ISODateString | null;
  lockedBy: string | null;
  /** User-authored JavaScript, run server-side inside a QuickJS sandbox (see server's modules/scripting/) - null until the user has ever saved one. Withheld (always null) when fetched via an anonymous share link - see objects/routes.ts's `redactScriptForShare`. */
  scriptSource: string | null;
  /**
   * Kill-switch for *background automation* specifically (see
   * modules/scripting/automation.ts's `// @automation` pragma) - a manual
   * Run-button click always works regardless of this flag. Defaults to
   * false so saving a script never silently starts auto-running it.
   */
  scriptEnabled: boolean;
  /** Present once the script has ever been run (manually or automatically); null before the first run. */
  scriptLastRun: ScriptRunSummary | null;
  /** User-configurable styling for the title overlaid on `cover` (see CoverImage.tsx) - null means "use the frontend's own default styling". */
  coverTextStyle: CoverTextStyle | null;
  /** Human-assignable, unique within this workspace - see modules/templates/ for how another object's template addresses this one by slug instead of its UUID. Null until set. */
  slug: string | null;
  /** Owner-only kill-switch for the comments feature on this object (see modules/comments/) - independent of `lockedAt`: comments stay postable on a locked object unless this is also set. */
  commentsDisabled: boolean;
  values: Record<string, PropertyValue>;
}

/** Styling for the object title text overlaid on its cover image - see CoverImage.tsx and CoverTextStyleEditor.tsx. */
export interface CoverTextStyle {
  /** Text color, e.g. "#ffffff". */
  color: string;
  /** Text opacity, 0-1 - independent of `backgroundOpacity` below. */
  opacity: number;
  /** Drop shadow behind the text, for legibility against a busy background image. */
  shadow: boolean;
  /** Whether a solid color band renders behind the text. */
  backgroundEnabled: boolean;
  backgroundColor: string;
  /** 0-1, independent of the text's own `opacity`. */
  backgroundOpacity: number;
  fontFamily: "default" | "serif" | "sans-serif" | "monospace" | "cursive";
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
}

/** One script run's outcome, as returned by the run-script endpoint and shown in ScriptPanel.tsx. */
export interface ScriptRunSummary {
  ranAt: ISODateString;
  success: boolean;
  triggerType: "manual" | "automation";
  durationMs: number;
  /** Captured `object.log(...)` output, truncated to the engine's log-size cap. */
  log: string;
  /** Present only when `success` is false. */
  error: string | null;
}

export interface Relation {
  id: string;
  workspaceId: string;
  propertyId: string;
  sourceObjectId: string;
  targetObjectId: string;
  createdAt: ISODateString;
}

export interface Block {
  id: string;
  objectId: string;
  parentBlockId: string | null;
  type: BlockType;
  content: Record<string, unknown>;
  position: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** Human-assignable, unique within this object - see modules/templates/ for how it's used to address this block from template expressions (`blocks.<slug>`). Null until set. */
  slug: string | null;
}

export interface View {
  id: string;
  workspaceId: string;
  objectTypeId: string | null;
  name: string;
  type: ViewType;
  config: ViewConfig;
  createdBy: string;
}

export interface FileAsset {
  id: string;
  workspaceId: string;
  objectId: string | null;
  blockId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: ISODateString;
}

/**
 * A pending share (from the Android Web Share Target or the desktop
 * bookmarklet) held in a per-user temp inbox until the share-target chooser
 * page commits it into a real workspace - see modules/shareTarget/. Not yet
 * associated with any workspace, since that's chosen in the chooser UI.
 */
export interface ShareInboxItem {
  id: string;
  kind: "url" | "text" | "files";
  url: string | null;
  title: string | null;
  text: string | null;
  files: { id: string; filename: string; mimeType: string; size: number }[];
  expiresAt: ISODateString;
  createdAt: ISODateString;
}

export interface SavedSearch {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  query: string;
  filters: ViewConfig["filters"];
}

export interface ActivityEntry {
  id: string;
  workspaceId: string;
  objectId: string | null;
  actorId: string;
  action: "created" | "updated" | "archived" | "deleted" | "commented" | "shared";
  summary: string;
  createdAt: ISODateString;
}

/** One entry in a block's edit history (see BlockHistoryPanel.tsx) - capped at 10 per block, most recent first. */
export interface BlockHistoryEntry {
  id: string;
  blockId: string;
  actorName: string;
  action: ActivityEntry["action"];
  summary: string;
  createdAt: ISODateString;
}

/**
 * A comment on an object (see modules/comments/) - plain text only (line
 * breaks preserved, no other markup), postable even on a locked object
 * unless the owner disabled comments (`ObjectRecord.commentsDisabled`).
 */
export interface Comment {
  id: string;
  workspaceId: string;
  objectId: string;
  /** Null once the author's account has been deleted (ON DELETE SET NULL) - `authorName` is denormalized at write time so the comment still displays correctly afterward. An anonymous share-link visitor's comment is attributed to the share's creator, same as any other edit they make - see workspaces/access.ts's `resolveActor`. */
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: ISODateString;
  /**
   * Set only when an owner/editor deleted *someone else's* comment
   * (moderation) - the row is kept as a tombstone (see CommentsPanel.tsx)
   * instead of being removed outright, so the thread visibly records who
   * removed it. An author deleting their own comment removes the row
   * instead of setting this, since there's nothing to disclose there.
   */
  deletedAt: ISODateString | null;
  deletedByName: string | null;
}

/** Payload broadcast over the WebSocket connection for a given workspace room. */
export interface RealtimeEvent {
  workspaceId: string;
  entity: "object" | "block" | "relation" | "view" | "member" | "pin" | "comment";
  action: "created" | "updated" | "deleted";
  entityId: string;
  /** The parent object id, when `entity` is "block" (omitted otherwise). */
  objectId?: string | null;
  actorId: string;
  /**
   * Identifies the browser tab/window that made the change (see
   * `lib/ws/clientId.ts` on the frontend). Distinct from `actorId`: two tabs
   * open under the same account have the same actorId but different
   * clientIds, so clients must skip their own echo by clientId, not by user -
   * otherwise editing the same document in two tabs as one user would look
   * like the other tab never receives any live updates at all.
   */
  clientId?: string;
  at: ISODateString;
}

/**
 * One person currently viewing an object - see `modules/presence/` on the
 * server. `viewerId` is `member:<userId>` for a real workspace member or
 * `anon:<visitorId>` for an anonymous share visitor (see
 * `lib/visitorIdentity.ts` on the frontend for where `visitorId` comes
 * from) - stable per identity, usable as both a React list key and for
 * "is this viewer me" checks. `displayName` is fully computed server-side,
 * including any " 2"/" 3" collision suffix (see `modules/presence/naming.ts`)
 * - the client never composes or parses it itself.
 */
export interface PresenceViewer {
  viewerId: string;
  displayName: string;
  isAnonymous: boolean;
  /** Real members only - anonymous viewers get a fixed, distinct avatar style instead (see PresencePanel.tsx). */
  avatarColor?: string;
  /** Precomputed by the server so the client never has to parse/strip the "Anonymous " prefix itself just to get an avatar initial. */
  avatarLetter: string;
  /** Real members only, when they've uploaded a profile picture - takes priority over avatarColor/avatarLetter when set. */
  avatarUrl?: string | null;
}

/**
 * Progress for one backup transfer (local download/upload, or a remote
 * destination's download/restore) - shares the same per-workspace socket as
 * `RealtimeEvent`/`PresenceSnapshotMessage`, distinguished by `type:
 * "backupProgress"`. Unlike those two, this is sent to exactly one client
 * (see `sendToClient` in modules/realtime/hub.ts) - a backup transfer is a
 * private action by the user who triggered it, not something other
 * workspace members should see. `jobId` is generated client-side and echoed
 * back so a client can ignore stray messages for a job it isn't (or is no
 * longer) tracking.
 *
 * `percent` is omitted whenever the transfer can't report byte-level
 * progress - notably Samba destinations, whose client library exposes no
 * progress callback or cheap pre-fetch size - in which case the UI shows an
 * indeterminate spinner instead of a bar.
 */
export interface BackupProgressMessage {
  type: "backupProgress";
  jobId: string;
  phase: "connecting" | "transferring" | "encrypting" | "decrypting" | "importing" | "done" | "error";
  percent?: number;
  message?: string;
  error?: string;
}

/**
 * The complete current viewer list for one object, broadcast over the same
 * per-workspace WebSocket connection `RealtimeEvent`s use (see
 * `useRealtime.ts`) - distinguished from those by `type: "presence"`, a
 * field plain `RealtimeEvent`s never have. Deliberately a full snapshot,
 * not a join/leave delta: a missed message is silently superseded by the
 * next one, so the client never has to reconcile partial updates into a
 * running total.
 */
export interface PresenceSnapshotMessage {
  type: "presence";
  workspaceId: string;
  objectId: string;
  viewers: PresenceViewer[];
}

/**
 * Sent to every member of a workspace whenever the set of backup files at one
 * destination changes - a scheduled or manual backup run uploading a new
 * file, or a user deleting one - so any open Settings page can refresh its
 * file list without a manual reload. Distinguished from `RealtimeEvent` by
 * `type`, same pattern as `BackupProgressMessage`/`PresenceSnapshotMessage`.
 */
export interface BackupFilesChangedMessage {
  type: "backupFilesChanged";
  workspaceId: string;
  destinationId: string;
}

/**
 * Sent to every member of a workspace after a backup run (manual "Jetzt
 * sichern" or the scheduler) finishes, once the schedule's and each
 * destination's `lastRunAt`/`lastRunStatus`/`nextRunAt` have been persisted -
 * lets any open Settings page refresh those without a manual reload,
 * regardless of which tab (or the scheduler, with no tab at all) triggered
 * the run.
 */
export interface BackupScheduleChangedMessage {
  type: "backupScheduleChanged";
  workspaceId: string;
}

/** One entry in a registered user's notification bell (see modules/notifications/) - currently only ever created for a new comment, hence no `type` field of its own the way `ActivityEntry.action` has (nothing else produces one yet). `body` is a truncated preview of the comment, not the full text - see modules/notifications/service.ts. */
export interface Notification {
  id: string;
  userId: string;
  workspaceId: string;
  objectId: string;
  objectTitle: string;
  commentId: string | null;
  actorName: string;
  body: string;
  createdAt: ISODateString;
  readAt: ISODateString | null;
}

/**
 * Sent to exactly one user's connected sockets (see `sendToUser` in
 * modules/realtime/hub.ts) whenever a `Notification` is created for them -
 * distinguished from `RealtimeEvent` by `type`, same pattern as
 * `BackupProgressMessage`. Deliberately per-user rather than broadcast to the
 * whole workspace room like `PresenceSnapshotMessage`/`BackupFilesChangedMessage`
 * - a notification's content (who commented, on what) isn't meant for every
 * other workspace member's socket to receive, only the recipient's.
 */
export interface NotificationMessage {
  type: "notification";
  workspaceId: string;
  notification: Notification;
}
