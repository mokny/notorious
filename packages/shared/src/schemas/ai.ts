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
}

/** One entry per workspace the current user belongs to that has AI configured - see modules/ai/service.ts's `listAiConfiguredWorkspacesForUser`. */
export interface AiConfiguredWorkspace {
  workspaceId: string;
  workspaceName: string;
}

export const sendChatMessageSchema = z.object({
  message: z.string().min(1).max(8000),
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
