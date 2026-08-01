import type { AiProvider } from "@notorious/shared";
import type { AiProviderAdapter } from "./types.js";
import { openAiAdapter } from "./openai.js";
import { anthropicAdapter } from "./anthropic.js";

export type { AiProviderAdapter, ChatMessage, ProviderChatParams, ProviderChatResult, ProviderToolCall, ProviderToolDef } from "./types.js";

/** 'openai-compatible' reuses the OpenAI adapter unchanged - it's for servers (Ollama and most others) that already implement OpenAI's chat-completions wire format, just at a different base URL. */
export function getProviderAdapter(provider: AiProvider): AiProviderAdapter {
  if (provider === "anthropic") return anthropicAdapter;
  return openAiAdapter;
}
