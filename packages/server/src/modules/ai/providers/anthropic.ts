import { badRequest } from "../../../lib/httpError.js";
import type { AiProviderAdapter, ChatMessage, ProviderChatParams, ProviderChatResult, ProviderToolCall } from "./types.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface WireMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

/**
 * Anthropic has no `role: "tool"` - a tool's result is a `tool_result`
 * content block inside a `user`-role turn, and if an assistant call made
 * several tool calls at once, every one of their results must land in the
 * *same* following user turn (not one user turn per result) - so
 * consecutive `tool` messages in the neutral history get merged here.
 */
function toWireMessages(messages: ChatMessage[]): WireMessage[] {
  const wire: WireMessage[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      const blocks: ContentBlock[] = [];
      if (message.content) blocks.push({ type: "text", text: message.content });
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
      }
      wire.push({ role: "assistant", content: blocks });
    } else if (message.role === "tool") {
      const block: ContentBlock = { type: "tool_result", tool_use_id: message.toolCallId ?? "", content: message.content ?? "" };
      const last = wire[wire.length - 1];
      if (last?.role === "user" && last.content.every((b) => b.type === "tool_result")) {
        last.content.push(block);
      } else {
        wire.push({ role: "user", content: [block] });
      }
    } else {
      wire.push({ role: "user", content: [{ type: "text", text: message.content ?? "" }] });
    }
  }
  return wire;
}

export const anthropicAdapter: AiProviderAdapter = {
  async chat(params: ProviderChatParams): Promise<ProviderChatResult> {
    const baseUrl = params.baseUrl?.replace(/\/$/, "") || API_URL;
    let response: Response;
    try {
      response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": params.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: params.model,
          max_tokens: MAX_TOKENS,
          system: params.systemPrompt,
          messages: toWireMessages(params.messages),
          tools: params.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      // The timeout above and a plain network failure (DNS, connection
      // refused, TLS error, ...) both throw here rather than resolving with
      // a non-ok `response` - left uncaught, this became a generic 500
      // "Internal server error" with no indication anything was even
      // attempted, let alone why it failed (see AgentChatPage.tsx, which now
      // surfaces this message verbatim instead of a hardcoded string).
      const reason = error instanceof DOMException && error.name === "TimeoutError" ? "timed out after 60s" : error instanceof Error ? error.message : "network error";
      throw badRequest(`AI provider request failed: ${reason}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw badRequest(`AI provider request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as { content: ContentBlock[]; usage?: { input_tokens: number; output_tokens: number } };
    let text: string | null = null;
    const toolCalls: ProviderToolCall[] = [];
    for (const block of data.content) {
      if (block.type === "text") text = (text ?? "") + block.text;
      else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, arguments: block.input });
    }

    return {
      content: text,
      toolCalls,
      usage: { promptTokens: data.usage?.input_tokens ?? 0, completionTokens: data.usage?.output_tokens ?? 0 },
    };
  },
};
