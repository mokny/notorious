import type {
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
  ObjectType,
  Property,
  ObjectRecord,
  Relation,
  Block,
  View,
  SavedSearch,
  FileAsset,
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ChangeEmailInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  CreateObjectTypeInput,
  CreatePropertyInput,
  UpdatePropertyInput,
  CreateObjectInput,
  UpdateObjectInput,
  SetObjectLockedInput,
  CreateRelationInput,
  CreateBlockInput,
  UpdateBlockInput,
  ToggleChecklistItemInput,
  MoveBlockInput,
  RestoreBlockInput,
  BlockHistoryEntry,
  CreateViewInput,
  UpdateViewInput,
  CreateSavedSearchInput,
  ApiKey,
  CreatedApiKey,
  CreateApiKeyInput,
  ShareLink,
  ShareLinkSummary,
  CreateShareLinkInput,
  ResolvedShareLink,
  UpdateObjectScriptInput,
  SetScriptEnabledInput,
  ScriptRunResult,
  ConfirmTwoFactorInput,
  DisableTwoFactorInput,
  VerifyTwoFactorInput,
} from "@notorious/shared";
import { apiRequest, apiUpload } from "./client.js";

/** Returned by login when the account has 2FA enabled - a real session is only created once `twoFactorApi.verify` succeeds. */
export interface Pending2fa {
  pending2fa: true;
}

export const authApi = {
  me: () => apiRequest<User>("/api/v1/auth/me"),
  register: (input: RegisterInput) => apiRequest<User>("/api/v1/auth/register", { method: "POST", body: input }),
  login: (input: LoginInput) => apiRequest<User | Pending2fa>("/api/v1/auth/login", { method: "POST", body: input }),
  logout: () => apiRequest<void>("/api/v1/auth/logout", { method: "POST" }),
  changePassword: (input: ChangePasswordInput) => apiRequest<void>("/api/v1/auth/password", { method: "PATCH", body: input }),
  changeEmail: (input: ChangeEmailInput) => apiRequest<User>("/api/v1/auth/email", { method: "PATCH", body: input }),
};

export const twoFactorApi = {
  setup: () => apiRequest<{ secret: string; qrCodeDataUrl: string }>("/api/v1/auth/2fa/setup", { method: "POST" }),
  confirm: (input: ConfirmTwoFactorInput) =>
    apiRequest<{ backupCodes: string[] }>("/api/v1/auth/2fa/confirm", { method: "POST", body: input }),
  disable: (input: DisableTwoFactorInput) => apiRequest<void>("/api/v1/auth/2fa/disable", { method: "POST", body: input }),
  verify: (input: VerifyTwoFactorInput) => apiRequest<User>("/api/v1/auth/2fa/verify", { method: "POST", body: input }),
};

export const workspaceApi = {
  list: () => apiRequest<Workspace[]>("/api/v1/workspaces"),
  create: (input: CreateWorkspaceInput) => apiRequest<Workspace>("/api/v1/workspaces", { method: "POST", body: input }),
  get: (id: string) => apiRequest<Workspace>(`/api/v1/workspaces/${id}`),
  update: (id: string, input: UpdateWorkspaceInput) =>
    apiRequest<Workspace>(`/api/v1/workspaces/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => apiRequest<void>(`/api/v1/workspaces/${id}`, { method: "DELETE" }),
  members: (id: string) => apiRequest<WorkspaceMember[]>(`/api/v1/workspaces/${id}/members`),
  invite: (id: string, input: InviteMemberInput) =>
    apiRequest<{ status: string }>(`/api/v1/workspaces/${id}/members`, { method: "POST", body: input }),
  updateMemberRole: (id: string, userId: string, role: string) =>
    apiRequest<void>(`/api/v1/workspaces/${id}/members/${userId}`, { method: "PATCH", body: { role } }),
  removeMember: (id: string, userId: string) =>
    apiRequest<void>(`/api/v1/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
  invites: (id: string) => apiRequest<WorkspaceInvite[]>(`/api/v1/workspaces/${id}/invites`),
  revokeInvite: (id: string, inviteId: string) =>
    apiRequest<void>(`/api/v1/workspaces/${id}/invites/${inviteId}`, { method: "DELETE" }),
  recentEdits: (id: string) => apiRequest<string[]>(`/api/v1/workspaces/${id}/recent-edits`),
  pins: (id: string) => apiRequest<string[]>(`/api/v1/workspaces/${id}/pins`),
  pin: (id: string, objectId: string) => apiRequest<void>(`/api/v1/workspaces/${id}/pins`, { method: "POST", body: { objectId } }),
  unpin: (id: string, objectId: string) => apiRequest<void>(`/api/v1/workspaces/${id}/pins/${objectId}`, { method: "DELETE" }),
  movePin: (id: string, objectId: string, afterObjectId: string | null) =>
    apiRequest<void>(`/api/v1/workspaces/${id}/pins/${objectId}/move`, { method: "POST", body: { afterObjectId } }),
  recentlyViewed: (id: string) => apiRequest<string[]>(`/api/v1/workspaces/${id}/recently-viewed`),
  touchRecentlyViewed: (id: string, objectId: string) =>
    apiRequest<void>(`/api/v1/workspaces/${id}/recently-viewed`, { method: "POST", body: { objectId } }),
};

export const schemaApi = {
  objectTypes: (workspaceId: string) => apiRequest<ObjectType[]>(`/api/v1/workspaces/${workspaceId}/object-types`),
  createObjectType: (workspaceId: string, input: CreateObjectTypeInput) =>
    apiRequest<ObjectType>(`/api/v1/workspaces/${workspaceId}/object-types`, { method: "POST", body: input }),
  deleteObjectType: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/object-types/${id}`, { method: "DELETE" }),
  properties: (objectTypeId: string) => apiRequest<Property[]>(`/api/v1/object-types/${objectTypeId}/properties`),
  createProperty: (workspaceId: string, input: CreatePropertyInput) =>
    apiRequest<Property>(`/api/v1/workspaces/${workspaceId}/properties`, { method: "POST", body: input }),
  updateProperty: (workspaceId: string, id: string, input: UpdatePropertyInput) =>
    apiRequest<Property>(`/api/v1/workspaces/${workspaceId}/properties/${id}`, { method: "PATCH", body: input }),
  deleteProperty: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/properties/${id}`, { method: "DELETE" }),
};

export interface ObjectListResult {
  items: ObjectRecord[];
  nextCursor: string | null;
}

export const objectApi = {
  list: (workspaceId: string, query: { objectTypeId?: string; archived?: boolean; cursor?: string; limit?: number }) =>
    apiRequest<ObjectListResult>(`/api/v1/workspaces/${workspaceId}/objects`, { query }),
  create: (workspaceId: string, input: CreateObjectInput) =>
    apiRequest<ObjectRecord>(`/api/v1/workspaces/${workspaceId}/objects`, { method: "POST", body: input }),
  get: (id: string) => apiRequest<ObjectRecord>(`/api/v1/objects/${id}`),
  update: (id: string, input: UpdateObjectInput) =>
    apiRequest<ObjectRecord>(`/api/v1/objects/${id}`, { method: "PATCH", body: input }),
  setLocked: (id: string, input: SetObjectLockedInput) => apiRequest<ObjectRecord>(`/api/v1/objects/${id}/lock`, { method: "POST", body: input }),
  archive: (id: string) => apiRequest<void>(`/api/v1/objects/${id}/archive`, { method: "POST" }),
  restore: (id: string) => apiRequest<void>(`/api/v1/objects/${id}/restore`, { method: "POST" }),
  remove: (id: string) => apiRequest<void>(`/api/v1/objects/${id}`, { method: "DELETE" }),
  backlinks: (id: string) => apiRequest<ObjectRecord[]>(`/api/v1/objects/${id}/backlinks`),
  completeRecurring: (id: string) =>
    apiRequest<{ completed: ObjectRecord; next: ObjectRecord | null }>(`/api/v1/objects/${id}/complete-recurring`, {
      method: "POST",
    }),
  createRelation: (workspaceId: string, input: CreateRelationInput) =>
    apiRequest<Relation>(`/api/v1/workspaces/${workspaceId}/relations`, { method: "POST", body: input }),
  deleteRelation: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/relations/${id}`, { method: "DELETE" }),
  deleteRelationByTriple: (workspaceId: string, propertyId: string, sourceObjectId: string, targetObjectId: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/relations/by-triple`, {
      method: "DELETE",
      body: { propertyId, sourceObjectId, targetObjectId },
    }),
};

/** Members-only, never available via share links - see workspaces/access.ts's `requireRealMemberAccess` on the server side. */
export const scriptApi = {
  updateSource: (id: string, input: UpdateObjectScriptInput) =>
    apiRequest<ObjectRecord>(`/api/v1/objects/${id}/script`, { method: "PATCH", body: input }),
  setEnabled: (id: string, input: SetScriptEnabledInput) =>
    apiRequest<ObjectRecord>(`/api/v1/objects/${id}/script/enabled`, { method: "POST", body: input }),
  run: (id: string) => apiRequest<ScriptRunResult>(`/api/v1/objects/${id}/run-script`, { method: "POST" }),
};

export const blockApi = {
  list: (objectId: string) => apiRequest<Block[]>(`/api/v1/objects/${objectId}/blocks`),
  create: (input: CreateBlockInput) => apiRequest<Block>("/api/v1/blocks", { method: "POST", body: input }),
  update: (id: string, input: UpdateBlockInput) => apiRequest<Block>(`/api/v1/blocks/${id}`, { method: "PATCH", body: input }),
  /** Exempt from the object lock - see toggleChecklistItemSchema. */
  toggleChecklistItem: (id: string, input: ToggleChecklistItemInput) =>
    apiRequest<Block>(`/api/v1/blocks/${id}/checklist-item`, { method: "PATCH", body: input }),
  move: (id: string, input: MoveBlockInput) => apiRequest<Block>(`/api/v1/blocks/${id}/move`, { method: "POST", body: input }),
  remove: (id: string) => apiRequest<void>(`/api/v1/blocks/${id}`, { method: "DELETE" }),
  /** Undo/redo only - see useEditorHistory.ts. */
  restore: (input: RestoreBlockInput) => apiRequest<Block>("/api/v1/blocks/restore", { method: "POST", body: input }),
  importMarkdown: (objectId: string, markdown: string) =>
    apiRequest<Block[]>("/api/v1/blocks/import-markdown", { method: "POST", body: { objectId, markdown } }),
  exportMarkdownUrl: (objectId: string) => `/api/v1/objects/${objectId}/export-markdown`,
  history: (id: string) => apiRequest<BlockHistoryEntry[]>(`/api/v1/blocks/${id}/history`),
};

export const viewApi = {
  list: (workspaceId: string, objectTypeId?: string) =>
    apiRequest<View[]>(`/api/v1/workspaces/${workspaceId}/views`, { query: { objectTypeId } }),
  create: (workspaceId: string, input: CreateViewInput) =>
    apiRequest<View>(`/api/v1/workspaces/${workspaceId}/views`, { method: "POST", body: input }),
  update: (id: string, input: UpdateViewInput) => apiRequest<View>(`/api/v1/views/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => apiRequest<void>(`/api/v1/views/${id}`, { method: "DELETE" }),
  results: (id: string, query: { cursor?: string; limit?: number }) =>
    apiRequest<ObjectListResult>(`/api/v1/views/${id}/results`, { query }),
};

export const searchApi = {
  search: (
    workspaceId: string,
    query: { q?: string; objectTypeId?: string; fuzzy?: boolean; relatedToObjectId?: string; tagPropertyId?: string; tagValue?: string },
  ) => apiRequest<ObjectRecord[]>(`/api/v1/workspaces/${workspaceId}/search`, { query }),
  savedSearches: (workspaceId: string) => apiRequest<SavedSearch[]>(`/api/v1/workspaces/${workspaceId}/saved-searches`),
  createSavedSearch: (workspaceId: string, input: CreateSavedSearchInput) =>
    apiRequest<SavedSearch>(`/api/v1/workspaces/${workspaceId}/saved-searches`, { method: "POST", body: input }),
  deleteSavedSearch: (id: string) => apiRequest<void>(`/api/v1/saved-searches/${id}`, { method: "DELETE" }),
};

export const fileApi = {
  listForObject: (objectId: string) => apiRequest<FileAsset[]>(`/api/v1/objects/${objectId}/files`),
  upload: (workspaceId: string, file: File, objectId?: string, blockId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (objectId) formData.append("objectId", objectId);
    if (blockId) formData.append("blockId", blockId);
    return apiUpload<FileAsset>(`/api/v1/workspaces/${workspaceId}/files`, formData);
  },
  // Deliberately plain (no share token appended here) - this value gets
  // stored as-is (an object/workspace's icon/cover field, a block's image
  // url, ...) and re-rendered later from that stored string, long after
  // this call returns. Wherever a file URL is actually put into an <img>/
  // <video> src, it goes through `withShareToken()` at render time instead
  // (see Icon.tsx, CoverImage.tsx, MediaBlocks.tsx) - appending it here too
  // would double up the query param on first render.
  downloadUrl: (id: string) => `/api/v1/files/${id}`,
  remove: (id: string) => apiRequest<void>(`/api/v1/files/${id}`, { method: "DELETE" }),
};

export const pushApi = {
  vapidPublicKey: () => apiRequest<{ publicKey: string }>("/api/v1/push/vapid-public-key"),
  subscribe: (subscription: PushSubscriptionJSON) =>
    apiRequest<void>("/api/v1/push/subscribe", { method: "POST", body: subscription }),
  unsubscribe: (endpoint: string) => apiRequest<void>("/api/v1/push/unsubscribe", { method: "POST", body: { endpoint } }),
};

export const backupApi = {
  exportUrl: (workspaceId: string) => `/api/v1/workspaces/${workspaceId}/backup`,
  import: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload<Workspace>("/api/v1/workspaces/import", formData);
  },
};

export const apiKeyApi = {
  list: () => apiRequest<ApiKey[]>("/api/v1/api-keys"),
  create: (input: CreateApiKeyInput) => apiRequest<CreatedApiKey>("/api/v1/api-keys", { method: "POST", body: input }),
  revoke: (id: string) => apiRequest<void>(`/api/v1/api-keys/${id}`, { method: "DELETE" }),
};

export const linkPreviewApi = {
  fetch: (url: string) => apiRequest<{ title: string | null; icon: string | null }>("/api/v1/link-preview", { query: { url } }),
};

export const systemApi = {
  version: () => apiRequest<{ version: string }>("/api/v1/version"),
  registrationStatus: () => apiRequest<{ enabled: boolean }>("/api/v1/system/registration-status"),
  twoFactorRequired: () => apiRequest<{ required: boolean }>("/api/v1/system/2fa-required"),
};

export const shareLinkApi = {
  list: (workspaceId: string, objectId: string | null) =>
    apiRequest<ShareLink[]>(`/api/v1/workspaces/${workspaceId}/share-links`, { query: { objectId: objectId ?? undefined } }),
  /** Owner-only: every active share in the workspace at once - see SettingsPage.tsx's "Public sharing" list. */
  listAll: (workspaceId: string) => apiRequest<ShareLinkSummary[]>(`/api/v1/workspaces/${workspaceId}/share-links/all`),
  create: (workspaceId: string, input: CreateShareLinkInput) =>
    apiRequest<ShareLink>(`/api/v1/workspaces/${workspaceId}/share-links`, { method: "POST", body: input }),
  revoke: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/share-links/${id}`, { method: "DELETE" }),
  resolve: (token: string) => apiRequest<ResolvedShareLink>(`/api/v1/public/share/${token}`),
};
