export interface ProviderToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Provider-neutral chat message - `agent.ts` builds a list of these from persisted `ai_chat_messages` rows and passes it to whichever adapter matches the user's configured provider. */
export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  /** Only set on an assistant message that called tools. */
  toolCalls?: ProviderToolCall[];
  /** Only set on a tool-result message - which call this answers. */
  toolCallId?: string;
}

export interface ProviderToolDef {
  name: string;
  description: string;
  /** JSON Schema, as produced by tools.ts's `toolParametersJsonSchema`. */
  parameters: Record<string, unknown>;
}

export interface ProviderChatParams {
  apiKey: string;
  baseUrl?: string | null;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tools: ProviderToolDef[];
}

export interface ProviderChatResult {
  content: string | null;
  toolCalls: ProviderToolCall[];
}

export interface AiProviderAdapter {
  chat(params: ProviderChatParams): Promise<ProviderChatResult>;
}
