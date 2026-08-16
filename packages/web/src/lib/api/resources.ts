import type {
  User,
  ChatStatus,
  Session,
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
  ObjectType,
  Property,
  ObjectRecord,
  Relation,
  Block,
  Comment,
  CreateCommentInput,
  SetCommentsDisabledInput,
  Notification,
  AdminNotification,
  View,
  SavedSearch,
  FileAsset,
  RegisterInput,
  RegisterPasskeyOptionsInput,
  LoginInput,
  ChangePasswordInput,
  ChangeEmailInput,
  UpdatePushPreferencesInput,
  UpdateLocaleInput,
  UpdateContentFontSizeInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  CreateObjectTypeInput,
  CreatePropertyInput,
  UpdatePropertyInput,
  CreateObjectInput,
  UpdateObjectInput,
  SetObjectLockedInput,
  SetObjectRequiresReverifyInput,
  ReverifyPasswordInput,
  WebauthnCredential,
  RenameWebauthnCredentialInput,
  CreateRelationInput,
  CreateBlockInput,
  UpdateBlockInput,
  ToggleChecklistItemInput,
  ReorderChecklistItemsInput,
  ToggleWhiteboardPresentingInput,
  GenerateAiBlockInput,
  CastVoteInput,
  UpdateVotingSettingsInput,
  VoteSummary,
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
  LinkedObjectSummary,
  UpdateObjectScriptInput,
  SetScriptEnabledInput,
  ScriptRunResult,
  ConfirmTwoFactorInput,
  DisableTwoFactorInput,
  VerifyTwoFactorInput,
  Webhook,
  CreatedWebhook,
  CreateWebhookInput,
  UpdateWebhookInput,
  WorkspaceAiConfigSummary,
  SaveWorkspaceAiConfigInput,
  PatchWorkspaceAiConfigInput,
  UpdateWorkspaceAiContextInput,
  AiConfiguredWorkspace,
  AiChatMessage,
  RenderedBlocksResponse,
  TemplateAutocompleteSchemaResponse,
  PresenceViewer,
  ShareIntakeFields,
  ShareCommitInput,
  ShareInboxItem,
  DiscoverFeedResult,
  FeedSource,
  FeedItem,
  CreateFeedSourceInput,
  UpdateFeedSourceInput,
  BackupDestination,
  BackupDestinationFile,
  CreateBackupDestinationInput,
  UpdateBackupDestinationInput,
  BackupSchedule,
  BackupScheduleInput,
  WorkspaceBackupKey,
  Conversation,
  ConversationSummary,
  ChannelListEntry,
  Message,
  MessageAttachment,
  MessageReaction,
  MessageSearchResult,
  CreateChannelInput,
  RenameChannelInput,
  CreateDmInput,
  SendMessageInput,
  ReactInput,
  Call,
  ActiveCallSummary,
  IncomingCallSummary,
  RtpCapabilities,
  TransportInfo,
  ProducerInfo,
  ConsumerInfo,
  MediaKind,
  ProducerSource,
  AdminCreateUserInput,
  AdminUpdateSettingsInput,
  AdminCallsSetupInput,
  AdminTriggerUpdateInput,
  AdminUpdateAutoUpdateInput,
  VersionCheckResult,
  AutoUpdateSettings,
  UpdateRun,
} from "@notorious/shared";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";
import { apiRequest, apiUpload, apiDownload, apiUploadWithProgress, ApiError } from "./client.js";
import { randomId } from "../randomId.js";

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
  updatePushPreferences: (input: UpdatePushPreferencesInput) => apiRequest<User>("/api/v1/auth/push-preferences", { method: "PATCH", body: input }),
  updateLocale: (input: UpdateLocaleInput) => apiRequest<User>("/api/v1/auth/locale", { method: "PATCH", body: input }),
  updateContentFontSize: (input: UpdateContentFontSizeInput) => apiRequest<User>("/api/v1/auth/content-font-size", { method: "PATCH", body: input }),
  sessions: () => apiRequest<Session[]>("/api/v1/auth/sessions"),
  revokeSession: (id: string) => apiRequest<void>(`/api/v1/auth/sessions/${id}`, { method: "DELETE" }),
  revokeOtherSessions: () => apiRequest<void>("/api/v1/auth/sessions", { method: "DELETE" }),
  reverify: (input: ReverifyPasswordInput) => apiRequest<void>("/api/v1/auth/reverify", { method: "POST", body: input }),
};

export const webauthnApi = {
  registerOptions: () => apiRequest<PublicKeyCredentialCreationOptionsJSON>("/api/v1/webauthn/register/options", { method: "POST" }),
  registerVerify: (response: RegistrationResponseJSON, name?: string) =>
    apiRequest<WebauthnCredential>("/api/v1/webauthn/register/verify", { method: "POST", body: { response, name } }),
  credentials: () => apiRequest<WebauthnCredential[]>("/api/v1/webauthn/credentials"),
  rename: (id: string, input: RenameWebauthnCredentialInput) =>
    apiRequest<void>(`/api/v1/webauthn/credentials/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => apiRequest<void>(`/api/v1/webauthn/credentials/${id}`, { method: "DELETE" }),
  registerAccountOptions: (input: RegisterPasskeyOptionsInput) =>
    apiRequest<PublicKeyCredentialCreationOptionsJSON>("/api/v1/webauthn/register-account/options", { method: "POST", body: input }),
  registerAccountVerify: (response: RegistrationResponseJSON) =>
    apiRequest<User>("/api/v1/webauthn/register-account/verify", { method: "POST", body: { response } }),
  loginOptions: () => apiRequest<PublicKeyCredentialRequestOptionsJSON>("/api/v1/webauthn/login/options", { method: "POST" }),
  loginVerify: (response: AuthenticationResponseJSON) => apiRequest<User>("/api/v1/webauthn/login/verify", { method: "POST", body: { response } }),
  reverifyOptions: () => apiRequest<PublicKeyCredentialRequestOptionsJSON>("/api/v1/webauthn/reverify/options", { method: "POST" }),
  reverifyVerify: (response: AuthenticationResponseJSON) =>
    apiRequest<void>("/api/v1/webauthn/reverify/verify", { method: "POST", body: { response } }),
};

export const twoFactorApi = {
  setup: () => apiRequest<{ secret: string; qrCodeDataUrl: string }>("/api/v1/auth/2fa/setup", { method: "POST" }),
  confirm: (input: ConfirmTwoFactorInput) =>
    apiRequest<{ backupCodes: string[] }>("/api/v1/auth/2fa/confirm", { method: "POST", body: input }),
  disable: (input: DisableTwoFactorInput) => apiRequest<void>("/api/v1/auth/2fa/disable", { method: "POST", body: input }),
  verify: (input: VerifyTwoFactorInput) => apiRequest<User>("/api/v1/auth/2fa/verify", { method: "POST", body: input }),
};

export const usersApi = {
  uploadAvatar: (file: Blob) => {
    const formData = new FormData();
    formData.append("file", file, "avatar.png");
    return apiUpload<{ avatarUrl: string }>("/api/v1/users/me/avatar", formData);
  },
  deleteAvatar: () => apiRequest<void>("/api/v1/users/me/avatar", { method: "DELETE" }),
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
  lastVisited: () => apiRequest<{ workspaceId: string; objectId: string } | null>("/api/v1/workspaces/last-visited"),
  reorder: (id: string, afterWorkspaceId: string | null) =>
    apiRequest<void>(`/api/v1/workspaces/${id}/reorder`, { method: "POST", body: { afterWorkspaceId } }),
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
  // Title/icon-only, reverify-safe variant of `get` - see server's
  // `GET /api/v1/objects/:id/summary` doc comment. Used by useObjectTitle.ts
  // for mention/link previews so a `requiresReverify` object's real title
  // shows up instead of "Untitled".
  summary: (id: string) => apiRequest<ObjectRecord>(`/api/v1/objects/${id}/summary`),
  update: (id: string, input: UpdateObjectInput) =>
    apiRequest<ObjectRecord>(`/api/v1/objects/${id}`, { method: "PATCH", body: input }),
  setLocked: (id: string, input: SetObjectLockedInput) => apiRequest<ObjectRecord>(`/api/v1/objects/${id}/lock`, { method: "POST", body: input }),
  setCommentsDisabled: (id: string, input: SetCommentsDisabledInput) =>
    apiRequest<ObjectRecord>(`/api/v1/objects/${id}/comments-disabled`, { method: "POST", body: input }),
  setRequiresReverify: (id: string, input: SetObjectRequiresReverifyInput) =>
    apiRequest<ObjectRecord>(`/api/v1/objects/${id}/requires-reverify`, { method: "POST", body: input }),
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
  /** Exempt from the object lock - see reorderChecklistItemsSchema. */
  reorderChecklistItems: (id: string, input: ReorderChecklistItemsInput) =>
    apiRequest<Block>(`/api/v1/blocks/${id}/checklist-reorder`, { method: "PATCH", body: input }),
  /** Owner-only, exempt from the object lock - see toggleWhiteboardPresentingSchema. */
  toggleWhiteboardPresenting: (id: string, input: ToggleWhiteboardPresentingInput) =>
    apiRequest<Block>(`/api/v1/blocks/${id}/whiteboard-presenting`, { method: "PATCH", body: input }),
  /** Open to any viewer (incl. anonymous share visitors) - see castVoteSchema. `voterKey` is only read for anonymous callers. */
  getVotes: (id: string, voterKey?: string) =>
    apiRequest<Record<string, VoteSummary>>(`/api/v1/blocks/${id}/votes${voterKey ? `?voterKey=${encodeURIComponent(voterKey)}` : ""}`),
  /** Exempt from the object lock, open to any viewer - see castVoteSchema. */
  castVote: (id: string, input: CastVoteInput) =>
    apiRequest<Record<string, VoteSummary>>(`/api/v1/blocks/${id}/vote`, { method: "PATCH", body: input }),
  /** Owner-only, exempt from the object lock - see updateVotingSettingsSchema. */
  updateVotingSettings: (id: string, input: UpdateVotingSettingsInput) =>
    apiRequest<Block>(`/api/v1/blocks/${id}/voting-settings`, { method: "PATCH", body: input }),
  /** Runs the AI block's prompt server-side and writes the answer straight into the block's content - see generateAiBlockSchema. */
  generateAi: (id: string, input: GenerateAiBlockInput) =>
    apiRequest<Block>(`/api/v1/blocks/${id}/ai-generate`, { method: "POST", body: input }),
  move: (id: string, input: MoveBlockInput) => apiRequest<Block>(`/api/v1/blocks/${id}/move`, { method: "POST", body: input }),
  remove: (id: string) => apiRequest<void>(`/api/v1/blocks/${id}`, { method: "DELETE" }),
  /** Undo/redo only - see useEditorHistory.ts. */
  restore: (input: RestoreBlockInput) => apiRequest<Block>("/api/v1/blocks/restore", { method: "POST", body: input }),
  importMarkdown: (objectId: string, markdown: string) =>
    apiRequest<Block[]>("/api/v1/blocks/import-markdown", { method: "POST", body: { objectId, markdown } }),
  exportMarkdownUrl: (objectId: string) => `/api/v1/objects/${objectId}/export-markdown`,
  history: (id: string) => apiRequest<BlockHistoryEntry[]>(`/api/v1/blocks/${id}/history`),
  /** Template-rendered text for this object's blocks - see ObjectDetailPage.tsx's Preview toggle and modules/templates/ on the server. */
  rendered: (objectId: string) => apiRequest<RenderedBlocksResponse>(`/api/v1/objects/${objectId}/blocks/rendered`),
};

export const commentApi = {
  list: (objectId: string) => apiRequest<Comment[]>(`/api/v1/objects/${objectId}/comments`),
  /** Works on a locked object (see createCommentSchema); 400s if the owner disabled comments (`ObjectRecord.commentsDisabled`) or the caller is rate-limited. */
  create: (objectId: string, input: CreateCommentInput) =>
    apiRequest<Comment>(`/api/v1/objects/${objectId}/comments`, { method: "POST", body: input }),
  /** Deleting your own comment removes it outright; an owner/editor deleting someone else's leaves a tombstone (`deletedAt`/`deletedByName`) instead - see modules/comments/service.ts. */
  remove: (id: string) => apiRequest<void>(`/api/v1/comments/${id}`, { method: "DELETE" }),
};

/** Members-only, full stop - see modules/notifications/routes.ts. */
export const notificationApi = {
  list: (workspaceId: string) => apiRequest<Notification[]>(`/api/v1/workspaces/${workspaceId}/notifications`),
  unreadCount: (workspaceId: string) => apiRequest<{ count: number }>(`/api/v1/workspaces/${workspaceId}/notifications/unread-count`),
  markRead: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/notifications/${id}/read`, { method: "POST" }),
  markAllRead: (workspaceId: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/notifications/read-all`, { method: "POST" }),
};

/** Server-admins-only, workspace-agnostic - see modules/admin/routes.ts's admin notification bell endpoints. */
export const adminNotificationApi = {
  list: () => apiRequest<AdminNotification[]>("/api/v1/admin/notifications"),
  unreadCount: () => apiRequest<{ count: number }>("/api/v1/admin/notifications/unread-count"),
  markRead: (id: string) => apiRequest<void>(`/api/v1/admin/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => apiRequest<void>("/api/v1/admin/notifications/read-all", { method: "POST" }),
};

export const templateApi = {
  /** Object types + their properties, bundled for TemplateSuggestion.ts's `.`-triggered property autocomplete - see modules/templates/routes.ts. */
  autocompleteSchema: (workspaceId: string) =>
    apiRequest<TemplateAutocompleteSchemaResponse>(`/api/v1/workspaces/${workspaceId}/templates/autocomplete-schema`),
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
    query: { q?: string; objectTypeId?: string; fuzzy?: boolean; relatedToObjectId?: string; tagPropertyId?: string; tagValue?: string; limit?: number },
  ) => apiRequest<ObjectRecord[]>(`/api/v1/workspaces/${workspaceId}/search`, { query }),
  savedSearches: (workspaceId: string) => apiRequest<SavedSearch[]>(`/api/v1/workspaces/${workspaceId}/saved-searches`),
  createSavedSearch: (workspaceId: string, input: CreateSavedSearchInput) =>
    apiRequest<SavedSearch>(`/api/v1/workspaces/${workspaceId}/saved-searches`, { method: "POST", body: input }),
  deleteSavedSearch: (id: string) => apiRequest<void>(`/api/v1/saved-searches/${id}`, { method: "DELETE" }),
};

export const fileApi = {
  listForObject: (objectId: string) => apiRequest<FileAsset[]>(`/api/v1/objects/${objectId}/files`),
  upload: (workspaceId: string, file: File, objectId?: string, blockId?: string, kind?: "image" | "cover") => {
    const formData = new FormData();
    formData.append("file", file);
    if (objectId) formData.append("objectId", objectId);
    if (blockId) formData.append("blockId", blockId);
    if (kind) formData.append("kind", kind);
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

export const chatApi = {
  // Forwards React Query's abort signal so an in-flight fetch from a stale
  // invalidation (e.g. an earlier userStatusChanged still resolving) gets
  // cancelled instead of racing a newer one and overwriting the cache with
  // outdated online/offline data - see ["chatConversations"] call sites.
  listConversations: (signal?: AbortSignal) => apiRequest<ConversationSummary[]>("/api/v1/chat/conversations", { signal }),
  createChannel: (workspaceId: string, input: CreateChannelInput) =>
    apiRequest<Conversation>(`/api/v1/workspaces/${workspaceId}/chat/channels`, { method: "POST", body: input }),
  listChannels: (workspaceId: string) => apiRequest<ChannelListEntry[]>(`/api/v1/workspaces/${workspaceId}/chat/channels`),
  joinChannel: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/chat/channels/${id}/join`, { method: "POST" }),
  createDm: (input: CreateDmInput) => apiRequest<Conversation>("/api/v1/chat/dms", { method: "POST", body: input }),
  rename: (id: string, input: RenameChannelInput) => apiRequest<{ id: string; name: string }>(`/api/v1/chat/conversations/${id}`, { method: "PATCH", body: input }),
  deleteChannel: (id: string) => apiRequest<void>(`/api/v1/chat/conversations/${id}`, { method: "DELETE", query: { manage: true } }),
  leave: (id: string) => apiRequest<void>(`/api/v1/chat/conversations/${id}`, { method: "DELETE" }),
  listMessages: (id: string, query: { before?: string; limit?: number } = {}) =>
    apiRequest<Message[]>(`/api/v1/chat/conversations/${id}/messages`, { query }),
  sendMessage: (id: string, input: SendMessageInput) => apiRequest<Message>(`/api/v1/chat/conversations/${id}/messages`, { method: "POST", body: input }),
  deleteMessage: (id: string) => apiRequest<void>(`/api/v1/chat/messages/${id}`, { method: "DELETE" }),
  react: (messageId: string, input: ReactInput) => apiRequest<MessageReaction[]>(`/api/v1/chat/messages/${messageId}/reactions`, { method: "POST", body: input }),
  unreact: (messageId: string, emoji: string) =>
    apiRequest<MessageReaction[]>(`/api/v1/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" }),
  markRead: (id: string, upToMessageId: string) =>
    apiRequest<{ unreadConversationCount: number }>(`/api/v1/chat/conversations/${id}/read`, { method: "POST", body: { upToMessageId } }),
  uploadAttachment: (conversationId: string, file: File, onProgress?: (info: { bytes: number; percent?: number }) => void) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiUploadWithProgress<MessageAttachment>(`/api/v1/chat/conversations/${conversationId}/attachments`, formData, onProgress);
  },
  attachmentUrl: (id: string) => `/api/v1/chat/attachments/${id}`,
  search: (q: string, limit?: number) => apiRequest<MessageSearchResult[]>("/api/v1/chat/search", { query: { q, limit } }),
  updateStatus: (status: ChatStatus) => apiRequest<void>("/api/v1/chat/status", { method: "PATCH", body: { status } }),
};

export const callApi = {
  start: (conversationId: string) => apiRequest<Call>(`/api/v1/chat/conversations/${conversationId}/calls`, { method: "POST" }),
  activeCall: (conversationId: string) => apiRequest<ActiveCallSummary | null>(`/api/v1/chat/conversations/${conversationId}/active-call`),
  ringingCall: () => apiRequest<IncomingCallSummary | null>("/api/v1/calls/ringing"),
  answer: (callId: string, clientId: string) => apiRequest<Call>(`/api/v1/calls/${callId}/answer`, { method: "POST", body: { clientId } }),
  decline: (callId: string) => apiRequest<void>(`/api/v1/calls/${callId}/decline`, { method: "POST" }),
  leave: (callId: string, clientId: string) => apiRequest<void>(`/api/v1/calls/${callId}/leave`, { method: "POST", body: { clientId } }),
  // --- mediasoup handshake (see CallContext.tsx) - REST request/response,
  // every call carries `clientId` so the server resolves which of the
  // caller's several open /ws/chat sockets this belongs to.
  rtpCapabilities: (callId: string, clientId: string) => apiRequest<RtpCapabilities>(`/api/v1/calls/${callId}/rtp-capabilities`, { query: { clientId } }),
  createTransport: (callId: string, clientId: string, direction: "send" | "recv") =>
    apiRequest<TransportInfo>(`/api/v1/calls/${callId}/transports`, { method: "POST", body: { clientId, direction } }),
  connectTransport: (callId: string, transportId: string, clientId: string, dtlsParameters: unknown) =>
    apiRequest<void>(`/api/v1/calls/${callId}/transports/${transportId}/connect`, { method: "POST", body: { clientId, dtlsParameters } }),
  produce: (callId: string, transportId: string, clientId: string, kind: MediaKind, rtpParameters: unknown, source: ProducerSource) =>
    apiRequest<{ producerId: string }>(`/api/v1/calls/${callId}/transports/${transportId}/produce`, { method: "POST", body: { clientId, kind, rtpParameters, source } }),
  closeProducer: (callId: string, producerId: string, clientId: string) =>
    apiRequest<void>(`/api/v1/calls/${callId}/producers/${producerId}/close`, { method: "POST", body: { clientId } }),
  listProducers: (callId: string, clientId: string) => apiRequest<ProducerInfo[]>(`/api/v1/calls/${callId}/producers`, { query: { clientId } }),
  consume: (callId: string, clientId: string, transportId: string, producerId: string, rtpCapabilities: unknown) =>
    apiRequest<ConsumerInfo>(`/api/v1/calls/${callId}/consume`, { method: "POST", body: { clientId, transportId, producerId, rtpCapabilities } }),
  resumeConsumer: (callId: string, consumerId: string, clientId: string) =>
    apiRequest<void>(`/api/v1/calls/${callId}/consumers/${consumerId}/resume`, { method: "POST", body: { clientId } }),
};

export const pushApi = {
  vapidPublicKey: () => apiRequest<{ publicKey: string }>("/api/v1/push/vapid-public-key"),
  subscribe: (subscription: PushSubscriptionJSON) =>
    apiRequest<void>("/api/v1/push/subscribe", { method: "POST", body: subscription }),
  unsubscribe: (endpoint: string) => apiRequest<void>("/api/v1/push/unsubscribe", { method: "POST", body: { endpoint } }),
};

export const backupApi = {
  exportUrl: (workspaceId: string) => `/api/v1/workspaces/${workspaceId}/backup`,
  /** Downloads the live export with byte progress (see apiDownload) - what the Settings page's "Download backup" button uses instead of a plain `window.open`. */
  downloadExport: (workspaceId: string, onProgress?: (info: { bytes: number; percent?: number }) => void, signal?: AbortSignal) =>
    apiDownload(`/api/v1/workspaces/${workspaceId}/backup`, { onProgress, signal }),
  import: (file: File, key?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (key) formData.append("key", key);
    return apiUpload<Workspace>("/api/v1/workspaces/import", formData);
  },
  /** Same as `import`, but with upload progress and cancellation - see ui/ProgressPopup.tsx. */
  importWithProgress: (file: File, key: string | undefined, onProgress?: (info: { bytes: number; percent?: number }) => void) => {
    const formData = new FormData();
    formData.append("file", file);
    if (key) formData.append("key", key);
    return apiUploadWithProgress<Workspace>("/api/v1/workspaces/import", formData, onProgress);
  },
  getKey: (workspaceId: string) => apiRequest<WorkspaceBackupKey>(`/api/v1/workspaces/${workspaceId}/backup/key`),
  regenerateKey: (workspaceId: string) =>
    apiRequest<WorkspaceBackupKey>(`/api/v1/workspaces/${workspaceId}/backup/key/regenerate`, { method: "POST" }),
  listDestinations: (workspaceId: string) =>
    apiRequest<BackupDestination[]>(`/api/v1/workspaces/${workspaceId}/backup/destinations`),
  createDestination: (workspaceId: string, input: CreateBackupDestinationInput) =>
    apiRequest<BackupDestination>(`/api/v1/workspaces/${workspaceId}/backup/destinations`, { method: "POST", body: input }),
  updateDestination: (workspaceId: string, id: string, input: UpdateBackupDestinationInput) =>
    apiRequest<BackupDestination>(`/api/v1/workspaces/${workspaceId}/backup/destinations/${id}`, { method: "PATCH", body: input }),
  deleteDestination: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/backup/destinations/${id}`, { method: "DELETE" }),
  testDestination: (workspaceId: string, id: string) =>
    apiRequest<{ ok: boolean }>(`/api/v1/workspaces/${workspaceId}/backup/destinations/${id}/test`, { method: "POST" }),
  getSchedule: (workspaceId: string) => apiRequest<BackupSchedule | null>(`/api/v1/workspaces/${workspaceId}/backup/schedule`),
  saveSchedule: (workspaceId: string, input: BackupScheduleInput) =>
    apiRequest<BackupSchedule>(`/api/v1/workspaces/${workspaceId}/backup/schedule`, { method: "PUT", body: input }),
  runNow: (workspaceId: string) =>
    apiRequest<BackupDestination[]>(`/api/v1/workspaces/${workspaceId}/backup/run-now`, { method: "POST" }),
  listDestinationFiles: (workspaceId: string, destinationId: string) =>
    apiRequest<BackupDestinationFile[]>(`/api/v1/workspaces/${workspaceId}/backup/destinations/${destinationId}/files`),
  /** Returns a fresh `jobId` alongside the download promise - pass the id straight to `useBackupProgress` to watch the server-side (destination -> server) leg over WS, while `onProgress` here tracks the second (server -> browser) leg via Content-Length. */
  downloadDestinationFile: (
    workspaceId: string,
    destinationId: string,
    filename: string,
    onProgress?: (info: { bytes: number; percent?: number }) => void,
    signal?: AbortSignal,
  ) => {
    const jobId = randomId();
    const promise = apiDownload(
      `/api/v1/workspaces/${workspaceId}/backup/destinations/${destinationId}/files/${encodeURIComponent(filename)}/download`,
      { query: { jobId }, onProgress, signal },
    );
    return { jobId, promise };
  },
  /** Restores a destination's backup file as a new workspace - same `jobId`-for-`useBackupProgress` pattern as `downloadDestinationFile`. The backup code is applied automatically server-side, never asked of the user (see restoreDestinationBackup's doc comment). */
  restoreDestinationFile: (workspaceId: string, destinationId: string, filename: string, signal?: AbortSignal) => {
    const jobId = randomId();
    const promise = apiRequest<Workspace>(
      `/api/v1/workspaces/${workspaceId}/backup/destinations/${destinationId}/files/${encodeURIComponent(filename)}/restore`,
      { method: "POST", query: { jobId }, signal },
    );
    return { jobId, promise };
  },
  deleteDestinationFile: (workspaceId: string, destinationId: string, filename: string) =>
    apiRequest<void>(
      `/api/v1/workspaces/${workspaceId}/backup/destinations/${destinationId}/files/${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    ),
};

export const apiKeyApi = {
  list: () => apiRequest<ApiKey[]>("/api/v1/api-keys"),
  create: (input: CreateApiKeyInput) => apiRequest<CreatedApiKey>("/api/v1/api-keys", { method: "POST", body: input }),
  revoke: (id: string) => apiRequest<void>(`/api/v1/api-keys/${id}`, { method: "DELETE" }),
};

export const webhookApi = {
  list: (workspaceId: string) => apiRequest<Webhook[]>(`/api/v1/workspaces/${workspaceId}/webhooks`),
  create: (workspaceId: string, input: CreateWebhookInput) =>
    apiRequest<CreatedWebhook>(`/api/v1/workspaces/${workspaceId}/webhooks`, { method: "POST", body: input }),
  update: (workspaceId: string, id: string, input: UpdateWebhookInput) =>
    apiRequest<Webhook>(`/api/v1/workspaces/${workspaceId}/webhooks/${id}`, { method: "PATCH", body: input }),
  remove: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/webhooks/${id}`, { method: "DELETE" }),
  test: (workspaceId: string, id: string) =>
    apiRequest<void>(`/api/v1/workspaces/${workspaceId}/webhooks/${id}/test`, { method: "POST" }),
};

export const aiApi = {
  listConfiguredWorkspaces: (workspaceId?: string) =>
    apiRequest<AiConfiguredWorkspace[]>(`/api/v1/ai/configured-workspaces${workspaceId ? `?workspaceId=${workspaceId}` : ""}`),
  getConfig: (workspaceId: string) => apiRequest<WorkspaceAiConfigSummary>(`/api/v1/workspaces/${workspaceId}/ai/config`),
  saveConfig: (workspaceId: string, input: SaveWorkspaceAiConfigInput) =>
    apiRequest<WorkspaceAiConfigSummary>(`/api/v1/workspaces/${workspaceId}/ai/config`, { method: "PUT", body: input }),
  patchConfig: (workspaceId: string, input: PatchWorkspaceAiConfigInput) =>
    apiRequest<WorkspaceAiConfigSummary>(`/api/v1/workspaces/${workspaceId}/ai/config`, { method: "PATCH", body: input }),
  removeConfig: (workspaceId: string) => apiRequest<void>(`/api/v1/workspaces/${workspaceId}/ai/config`, { method: "DELETE" }),
  updateContext: (workspaceId: string, input: UpdateWorkspaceAiContextInput) =>
    apiRequest<WorkspaceAiConfigSummary>(`/api/v1/workspaces/${workspaceId}/ai/context`, { method: "PATCH", body: input }),
  listMessages: (workspaceId: string) => apiRequest<AiChatMessage[]>(`/api/v1/workspaces/${workspaceId}/ai/chat`),
  sendMessage: (workspaceId: string, message: string, activeObjectId: string | null) =>
    apiRequest<AiChatMessage[]>(`/api/v1/workspaces/${workspaceId}/ai/chat`, { method: "POST", body: { message, activeObjectId } }),
  clearMessages: (workspaceId: string) => apiRequest<void>(`/api/v1/workspaces/${workspaceId}/ai/chat`, { method: "DELETE" }),
};

export const linkPreviewApi = {
  fetch: (url: string) => apiRequest<{ title: string | null; icon: string | null }>("/api/v1/link-preview", { query: { url } }),
};

export const feedApi = {
  discover: (blockId: string, url: string) =>
    apiRequest<DiscoverFeedResult>(`/api/v1/blocks/${blockId}/feed-sources/discover`, { method: "POST", body: { url } }),
  listSources: (blockId: string) => apiRequest<FeedSource[]>(`/api/v1/blocks/${blockId}/feed-sources`),
  createSource: (blockId: string, input: CreateFeedSourceInput) =>
    apiRequest<FeedSource>(`/api/v1/blocks/${blockId}/feed-sources`, { method: "POST", body: input }),
  updateSource: (id: string, input: UpdateFeedSourceInput) =>
    apiRequest<FeedSource>(`/api/v1/feed-sources/${id}`, { method: "PATCH", body: input }),
  removeSource: (id: string) => apiRequest<void>(`/api/v1/feed-sources/${id}`, { method: "DELETE" }),
  refreshSource: (id: string) => apiRequest<FeedSource>(`/api/v1/feed-sources/${id}/refresh`, { method: "POST" }),
  items: (blockId: string, limit: number) => apiRequest<FeedItem[]>(`/api/v1/blocks/${blockId}/feed-items`, { query: { limit } }),
};

export const shareTargetApi = {
  intakeJson: (input: ShareIntakeFields) =>
    apiRequest<{ id: string }>("/api/v1/share-target/intake-json", { method: "POST", body: input }),
  inbox: (id: string) => apiRequest<ShareInboxItem>(`/api/v1/share-target/inbox/${id}`),
  commit: (input: ShareCommitInput) =>
    apiRequest<ObjectRecord>("/api/v1/share-target/commit", { method: "POST", body: input }),
};

export const systemApi = {
  version: () => apiRequest<{ version: string }>("/api/v1/version"),
  registrationStatus: () => apiRequest<{ enabled: boolean }>("/api/v1/system/registration-status"),
  twoFactorRequired: () => apiRequest<{ required: boolean }>("/api/v1/system/2fa-required"),
  callsStatus: () => apiRequest<{ enabled: boolean }>("/api/v1/system/calls-status"),
  passkeysStatus: () => apiRequest<{ enabled: boolean }>("/api/v1/system/passkeys-status"),
};

export interface AdminSettings {
  registrationEnabled: boolean;
  require2faEnabled: boolean;
  allowTemplateHttpRequests: boolean;
  callsEnabled: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  isServerAdmin: boolean;
}

export interface AdminUserDeletionPreview {
  user: { id: string; email: string; name: string };
  ownedWorkspaces: { id: string; name: string; memberCount: number; objectCount: number }[];
  reattributedItemCount: number;
}

export interface AdminAuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
}

export const adminApi = {
  getSettings: () => apiRequest<AdminSettings>("/api/v1/admin/settings"),
  updateSettings: (input: AdminUpdateSettingsInput) => apiRequest<AdminSettings>("/api/v1/admin/settings", { method: "PATCH", body: input }),

  listUsers: () => apiRequest<AdminUser[]>("/api/v1/admin/users"),
  createUser: (input: AdminCreateUserInput) => apiRequest<{ user: AdminUser; password: string }>("/api/v1/admin/users", { method: "POST", body: input }),
  promoteUser: (id: string) => apiRequest<AdminUser>(`/api/v1/admin/users/${id}/promote`, { method: "POST" }),
  demoteUser: (id: string) => apiRequest<AdminUser>(`/api/v1/admin/users/${id}/demote`, { method: "POST" }),
  deletionPreview: (id: string) => apiRequest<AdminUserDeletionPreview>(`/api/v1/admin/users/${id}/delete-preview`),
  deleteUser: (id: string) => apiRequest<void>(`/api/v1/admin/users/${id}`, { method: "DELETE" }),

  auditLog: () => apiRequest<AdminAuditEntry[]>("/api/v1/admin/audit-log"),

  versionCheck: () => apiRequest<VersionCheckResult>("/api/v1/admin/version-check"),
  /** Whether `streamUpdate` needs a `sudoPassword` - see AdminUpdateTab.tsx. */
  updateSudoRequired: () => apiRequest<{ required: boolean }>("/api/v1/admin/update/sudo-required"),
  updateHistory: (limit = 10) => apiRequest<UpdateRun[]>("/api/v1/admin/update/history", { query: { limit } }),
  getAutoUpdateSettings: () => apiRequest<AutoUpdateSettings>("/api/v1/admin/auto-update"),
  updateAutoUpdateSettings: (input: AdminUpdateAutoUpdateInput) =>
    apiRequest<AutoUpdateSettings>("/api/v1/admin/auto-update", { method: "PATCH", body: input }),
  /**
   * Streams `POST /api/v1/admin/update`'s output live - uses `fetch` +
   * a manual reader rather than `EventSource` (which can only issue GET
   * requests, and this needs a POST to actually trigger the update) - see
   * AdminUpdateTab.tsx. `onLine` fires once per emitted line, `onDone` once
   * the update script exits or the connection otherwise closes (including
   * because the server process itself just got restarted mid-stream). If
   * the server rejects the request outright (missing/wrong sudo password -
   * checked there before anything is actually downloaded/rebuilt), `onLine`
   * is never called and this throws instead, same as any other `ApiError`.
   */
  async streamUpdate(input: AdminTriggerUpdateInput, onLine: (line: string) => void, onDone: () => void): Promise<void> {
    const response = await fetch("/api/v1/admin/update", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const message = data && typeof data === "object" && "message" in data ? String(data.message) : "Update failed to start";
      throw new ApiError(response.status, message);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      onDone();
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          if (event.startsWith("event: done")) continue;
          const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) onLine(JSON.parse(dataLine.slice("data: ".length)) as string);
        }
      }
    } catch {
      // The connection already succeeded (response.ok above), so a read failure here means the
      // server process itself just got restarted mid-stream - the expected end of a successful
      // update, not a real error. Swallow it; onDone()'s polling is what tells the caller whether
      // the new server actually came back up.
    } finally {
      onDone();
    }
  },

  detectPublicIp: () => apiRequest<{ ip: string | null }>("/api/v1/admin/detect-public-ip"),
  callsSetup: (input: AdminCallsSetupInput) => apiRequest<{ restarting: true }>("/api/v1/admin/calls-setup", { method: "POST", body: input }),
  restart: () => apiRequest<{ restarting: true }>("/api/v1/admin/restart", { method: "POST" }),
};

export const presenceApi = {
  list: (objectId: string) => apiRequest<{ viewers: PresenceViewer[] }>(`/api/v1/objects/${objectId}/presence`),
  /** Join/keep-alive/rename in one - see hooks/usePresence.ts. `visitorId`/`displayName` only matter for an anonymous viewer (omitted for a logged-in member, whose identity/name come from their session). `tabId` identifies this specific hook instance, not the browser tab - see presenceHeartbeatSchema's own doc comment for why that's deliberate. */
  heartbeat: (objectId: string, input: { visitorId?: string; displayName?: string; tabId: string }) =>
    apiRequest<{ viewers: PresenceViewer[] }>(`/api/v1/objects/${objectId}/presence`, { method: "POST", body: input }),
  /** `keepalive: true` so this still fires from an unmount during navigation/tab-close (see lib/api/client.ts's own doc comment on that option). */
  leave: (objectId: string, tabId: string, visitorId?: string) =>
    apiRequest<void>(`/api/v1/objects/${objectId}/presence`, { method: "DELETE", query: { visitorId, tabId }, keepalive: true }),
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
  /** Objects a single-object share of `objectId` would additionally grant access to - see ShareDialog.tsx's notice. */
  linkedPreview: (workspaceId: string, objectId: string) =>
    apiRequest<LinkedObjectSummary[]>(`/api/v1/workspaces/${workspaceId}/objects/${objectId}/linked-share-preview`),
};
