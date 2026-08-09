import { badRequest } from "../../../lib/httpError.js";
import type { AiProviderAdapter, ChatMessage, ProviderChatParams, ProviderChatResult, ProviderToolCall } from "./types.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface OpenAiToolCallWire {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  /** Gemini-specific (Google's OpenAI-compat layer nests thought_signature here rather than at the top level). */
  extra_content?: { google: { thought_signature: string } };
}

/** OpenAI's chat completions wire format - `role: "tool"` messages need a `tool_call_id`, and an assistant message that called tools carries them back as `tool_calls` with JSON-stringified (not object) arguments. */
function toWireMessages(systemPrompt: string, messages: ChatMessage[]): unknown[] {
  const wire: unknown[] = [{ role: "system", content: systemPrompt }];
  for (const message of messages) {
    if (message.role === "assistant" && message.toolCalls?.length) {
      wire.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map(
          (call): OpenAiToolCallWire => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            ...(call.signature ? { extra_content: { google: { thought_signature: call.signature } } } : {}),
          }),
        ),
      });
    } else if (message.role === "tool") {
      wire.push({ role: "tool", tool_call_id: message.toolCallId, content: message.content ?? "" });
    } else {
      wire.push({ role: message.role, content: message.content });
    }
  }
  return wire;
}

/** Also used for the 'openai-compatible' provider (Ollama and most local-model servers implement this same API) - only the base URL differs. */
export const openAiAdapter: AiProviderAdapter = {
  async chat(params: ProviderChatParams): Promise<ProviderChatResult> {
    const baseUrl = params.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.apiKey}` },
        body: JSON.stringify({
          model: params.model,
          messages: toWireMessages(params.systemPrompt, params.messages),
          tools: params.tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      // See anthropic.ts's identical catch for why this needs to exist at
      // all - a timeout/network failure here used to surface as a generic
      // 500 "Internal server error" with no detail.
      const reason = error instanceof DOMException && error.name === "TimeoutError" ? "timed out after 60s" : error instanceof Error ? error.message : "network error";
      throw badRequest(`AI provider request failed: ${reason}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw badRequest(`AI provider request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string | null; tool_calls?: OpenAiToolCallWire[] } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const message = data.choices[0]?.message;
    const toolCalls: ProviderToolCall[] = (message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: parseArguments(call.function.arguments),
      signature: call.extra_content?.google.thought_signature,
    }));

    return {
      content: message?.content ?? null,
      toolCalls,
      usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 },
    };
  },
};

function parseArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
