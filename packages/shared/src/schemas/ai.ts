import { z } from "zod";

export const AI_PROVIDERS = ["openai", "anthropic", "google", "openai-compatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_USAGE_RESET_INTERVALS = ["hourly", "daily", "weekly", "monthly"] as const;
export type AiUsageResetInterval = (typeof AI_USAGE_RESET_INTERVALS)[number];

export const saveWorkspaceAiConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(2000),
  baseUrl: z.string().url().max(2000).nullable().optional(),
  maxTokenBudget: z.number().int().positive().nullable().optional(),
  usageResetInterval: z.enum(AI_USAGE_RESET_INTERVALS),
});
export type SaveWorkspaceAiConfigInput = z.infer<typeof saveWorkspaceAiConfigSchema>;

/** Updates just the usage budget/reset cadence of an existing config - see modules/ai/service.ts's `patchWorkspaceAiConfig`. */
export const patchWorkspaceAiConfigSchema = z.object({
  maxTokenBudget: z.number().int().positive().nullable(),
  usageResetInterval: z.enum(AI_USAGE_RESET_INTERVALS),
});
export type PatchWorkspaceAiConfigInput = z.infer<typeof patchWorkspaceAiConfigSchema>;

/** How many of a user's own most-recent chat turns (in steps of 5) are sent to the model as context - see agent.ts's `limitHistory`. 0 = only the message just sent, no prior turns. */
export const AI_CHAT_HISTORY_LIMIT_MAX = 50;

/** Updates the Agent Chat's context settings for a workspace - see modules/ai/service.ts's `updateWorkspaceAiContext`. Owner-only, separate from `saveWorkspaceAiConfigSchema` so changing these doesn't require re-entering the provider API key. */
export const updateWorkspaceAiContextSchema = z.object({
  purposeInstructions: z.string().max(4000).nullable(),
  chatHistoryLimit: z.number().int().min(0).max(AI_CHAT_HISTORY_LIMIT_MAX),
  activityFeedEnabled: z.boolean(),
});
export type UpdateWorkspaceAiContextInput = z.infer<typeof updateWorkspaceAiContextSchema>;

/** Never includes the API key itself - see modules/ai/service.ts's `getWorkspaceAiConfigSummary`. */
export interface WorkspaceAiConfigSummary {
  configured: boolean;
  provider: AiProvider | null;
  model: string | null;
  baseUrl: string | null;
  maxTokenBudget: number | null;
  consumedTokens: number;
  usageResetInterval: AiUsageResetInterval | null;
  usageResetAt: string | null;
  /** Freeform "purpose & behavior" text an owner sets - appended to the agent's system prompt (see agent.ts's `systemPrompt`). Null when never set. */
  purposeInstructions: string | null;
  chatHistoryLimit: number;
  /** Whether the agent's `list_recent_activity` tool (chat-only, not exposed via MCP) is available - off by default. */
  activityFeedEnabled: boolean;
}

/** One entry per workspace the current user belongs to that has AI configured - see modules/ai/service.ts's `listAiConfiguredWorkspacesForUser`. */
export interface AiConfiguredWorkspace {
  workspaceId: string;
  workspaceName: string;
}

export const sendChatMessageSchema = z.object({
  message: z.string().min(1).max(8000),
  /** The object the user currently has open (e.g. the object detail page behind the chat overlay), so they can say "update this" without naming it - see agent.ts's `systemPrompt`. Null/omitted when the chat was opened somewhere with no single object in view. */
  activeObjectId: z.string().nullable().optional(),
});
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Gemini's thought_signature - must be resent verbatim on later turns or the provider rejects the request. Absent for providers that don't use it. */
  signature?: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCalls: AiToolCall[] | null;
  toolCallId: string | null;
  createdAt: string;
}
