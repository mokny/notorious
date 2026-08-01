import { z } from "zod";

export const AI_PROVIDERS = ["openai", "anthropic", "openai-compatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const saveAiConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(2000),
  baseUrl: z.string().url().max(2000).nullable().optional(),
});
export type SaveAiConfigInput = z.infer<typeof saveAiConfigSchema>;

/** Never includes the API key itself - see modules/ai/service.ts's `getAiConfig`. */
export interface AiConfigSummary {
  configured: boolean;
  provider: AiProvider | null;
  model: string | null;
  baseUrl: string | null;
}

export const sendChatMessageSchema = z.object({
  message: z.string().min(1).max(8000),
});
export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCalls: AiToolCall[] | null;
  toolCallId: string | null;
  createdAt: string;
}
