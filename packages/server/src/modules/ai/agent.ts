import { z } from "zod";
import type { AiChatMessage } from "@notorious/shared";
import { badRequest } from "../../lib/httpError.js";
import { getDecryptedAiConfig, listChatMessages, appendChatMessage } from "./service.js";
import { getProviderAdapter, resolveBaseUrl, type ChatMessage } from "./providers/index.js";
import { AI_TOOLS, findTool, toolParametersJsonSchema } from "./tools.js";

const MAX_TOOL_ITERATIONS = 8;

function systemPrompt(workspaceId: string): string {
  return [
    "You are an assistant embedded in Notorious, a notes and knowledge-base app.",
    `The user is currently in workspace "${workspaceId}" - use this as the workspaceId for any tool that needs one, unless the user clearly means a different workspace (call list_workspaces to find its id first).`,
    "You can create, search, read, update and archive objects, and add paragraph/checklist blocks to them, via the tools available to you. Actually call the relevant tool to perform an action - never just claim you did something without calling the tool for it.",
    "Call list_object_types before create_object if you don't already know the right objectTypeId. Keep replies brief and concrete about what you did.",
  ].join(" ");
}

function toChatMessage(message: AiChatMessage): ChatMessage {
  return {
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls ?? undefined,
    toolCallId: message.toolCallId ?? undefined,
  };
}

/**
 * Runs one turn of the tool-calling loop: the user's message goes to the
 * configured provider along with the shared AI_TOOLS registry (see tools.ts -
 * the same tools the MCP server exposes to external clients); any tool
 * call(s) the model makes are executed here (permission-checked per call,
 * not trusted from the model) and fed back until it returns a final answer
 * with no more tool calls, or `MAX_TOOL_ITERATIONS` is hit. Every message
 * along the way is persisted, so a page reload doesn't lose the exchange.
 */
export async function sendChatMessage(userId: string, workspaceId: string, userMessage: string): Promise<AiChatMessage[]> {
  const config = await getDecryptedAiConfig(userId);
  if (!config) throw badRequest("No AI provider configured - set one up in Settings first");

  const adapter = getProviderAdapter(config.provider);
  const toolDefs = AI_TOOLS.map((tool) => ({ name: tool.name, description: tool.description, parameters: toolParametersJsonSchema(tool) }));

  const appended: AiChatMessage[] = [];
  const userRow = await appendChatMessage(userId, workspaceId, { role: "user", content: userMessage });
  appended.push(userRow);

  const history = (await listChatMessages(userId, workspaceId)).map(toChatMessage);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await adapter.chat({
      apiKey: config.apiKey,
      baseUrl: resolveBaseUrl(config.provider, config.baseUrl),
      model: config.model,
      systemPrompt: systemPrompt(workspaceId),
      messages: history,
      tools: toolDefs,
    });

    if (result.toolCalls.length === 0) {
      const assistantRow = await appendChatMessage(userId, workspaceId, { role: "assistant", content: result.content ?? "" });
      appended.push(assistantRow);
      return appended;
    }

    const assistantRow = await appendChatMessage(userId, workspaceId, {
      role: "assistant",
      content: result.content,
      toolCalls: result.toolCalls,
    });
    appended.push(assistantRow);
    history.push(toChatMessage(assistantRow));

    for (const call of result.toolCalls) {
      const tool = findTool(call.name);
      let resultText: string;
      try {
        if (!tool) throw new Error(`Unknown tool: ${call.name}`);
        // The model's arguments are untrusted input, same as a request body -
        // validated against the tool's own zod shape (the same one MCP
        // validates against) before anything touches the database.
        const args = z.object(tool.shape).parse(call.arguments);
        const output = await tool.execute(args, { userId });
        resultText = JSON.stringify(output);
      } catch (error) {
        resultText = JSON.stringify({ error: error instanceof Error ? error.message : "Tool call failed" });
      }
      const toolRow = await appendChatMessage(userId, workspaceId, { role: "tool", content: resultText, toolCallId: call.id });
      appended.push(toolRow);
      history.push(toChatMessage(toolRow));
    }
  }

  const cappedRow = await appendChatMessage(userId, workspaceId, {
    role: "assistant",
    content: "I made a number of tool calls without reaching a final answer - stopping here to avoid looping. Try rephrasing or breaking the request into smaller steps.",
  });
  appended.push(cappedRow);
  return appended;
}

/**
 * A single one-shot completion for an AI block (see modules/blocks - the
 * only caller): no tool-calling loop, no chat-history persistence - the
 * result is written straight into the block's own content instead. `context`
 * is the host object's title + its blocks rendered to Markdown, so prompts
 * like "summarize this page" have something to work with.
 */
export async function generateBlockAnswer(userId: string, prompt: string, context: string): Promise<string> {
  const config = await getDecryptedAiConfig(userId);
  if (!config) throw badRequest("No AI provider configured - set one up in Settings first");

  const adapter = getProviderAdapter(config.provider);
  const result = await adapter.chat({
    apiKey: config.apiKey,
    baseUrl: resolveBaseUrl(config.provider, config.baseUrl),
    model: config.model,
    systemPrompt:
      "You are an AI block embedded inline in a page of a notes app called Notorious. Answer the user's prompt directly and concisely, formatted as Markdown. You have no tools - use only the prompt and the page context below to answer.",
    messages: [{ role: "user", content: `Page context:\n${context}\n\n---\n\nPrompt: ${prompt}` }],
    tools: [],
  });
  return result.content ?? "";
}
