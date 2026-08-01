import type { AiProvider } from "@notorious/shared";
import type { AiProviderAdapter } from "./types.js";
import { openAiAdapter } from "./openai.js";
import { anthropicAdapter } from "./anthropic.js";

export type { AiProviderAdapter, ChatMessage, ProviderChatParams, ProviderChatResult, ProviderToolCall, ProviderToolDef } from "./types.js";

/** Google's own OpenAI-compatible endpoint (https://ai.google.dev/gemini-api/docs/openai) - accepts the same Gemini API key as a plain `Authorization: Bearer` token, so 'google' can reuse the OpenAI adapter unchanged, same as 'openai-compatible' does for Ollama/others. */
const GOOGLE_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/** 'openai-compatible' and 'google' both reuse the OpenAI adapter unchanged - they're servers that already implement OpenAI's chat-completions wire format, just at a different base URL. */
export function getProviderAdapter(provider: AiProvider): AiProviderAdapter {
  if (provider === "anthropic") return anthropicAdapter;
  return openAiAdapter;
}

/** 'google' doesn't ask the user for a base URL (unlike 'openai-compatible', where it's required) - it's resolved here instead, so Settings can stay a plain provider+model+key form for it. */
export function resolveBaseUrl(provider: AiProvider, storedBaseUrl: string | null): string | null {
  if (provider === "google" && !storedBaseUrl) return GOOGLE_OPENAI_BASE_URL;
  return storedBaseUrl;
}
