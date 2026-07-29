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
  values: Record<string, PropertyValue>;
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

/** Payload broadcast over the WebSocket connection for a given workspace room. */
export interface RealtimeEvent {
  workspaceId: string;
  entity: "object" | "block" | "relation" | "view" | "member";
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
