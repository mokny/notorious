/**
 * The AI chat overlay entry isn't a real `conversations` row - it's backed by
 * the separate, workspace-scoped `ai_chat_messages` API (see aiApi in
 * resources.ts). To slot it into ChatPanel/ThreadView's plain-string
 * `conversationId` prop without touching the real chat backend, its "id" is
 * this sentinel prefix + the workspace id, decoded back in ThreadView.tsx.
 */
const AI_CONVERSATION_PREFIX = "ai:";

export function toAiConversationId(workspaceId: string): string {
  return `${AI_CONVERSATION_PREFIX}${workspaceId}`;
}

export function aiConversationWorkspaceId(conversationId: string): string | null {
  return conversationId.startsWith(AI_CONVERSATION_PREFIX) ? conversationId.slice(AI_CONVERSATION_PREFIX.length) : null;
}
