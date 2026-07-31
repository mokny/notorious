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
  createdAt: ISODateString;
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

export type PropertyValue = string | number | boolean | string[] | null;

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

/** Payload broadcast over the WebSocket connection for a given workspace room. */
export interface RealtimeEvent {
  workspaceId: string;
  entity: "object" | "block" | "relation" | "view" | "member" | "pin";
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
