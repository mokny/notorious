import { z } from "zod";
import type { AiChatMessage } from "@notorious/shared";
import { badRequest } from "../../lib/httpError.js";
import { getDecryptedWorkspaceAiConfig, listChatMessages, appendChatMessage, assertBudgetNotExceeded, recordTokenUsage } from "./service.js";
import { getProviderAdapter, resolveBaseUrl, type ChatMessage } from "./providers/index.js";
import { AI_TOOLS, LIST_RECENT_ACTIVITY_TOOL, toolParametersJsonSchema, type AiTool } from "./tools.js";
import { getObject } from "../objects/service.js";

const MAX_TOOL_ITERATIONS = 8;

function systemPrompt(workspaceId: string, options: { purposeInstructions: string | null; activeObject: { id: string; title: string } | null }): string {
  const parts = [
    "You are an assistant embedded in Notorious, a notes and knowledge-base app.",
    `The user is currently in workspace "${workspaceId}" - use this as the workspaceId for any tool that needs one, unless the user clearly means a different workspace (call list_workspaces to find its id first).`,
    "You can create, search, read, update and archive objects, and add paragraph/checklist blocks to them, via the tools available to you. Actually call the relevant tool to perform an action - never just claim you did something without calling the tool for it.",
    "Call list_object_types before create_object if you don't already know the right objectTypeId. Keep replies brief and concrete about what you did.",
  ];
  if (options.activeObject) {
    parts.push(
      `The user currently has the object "${options.activeObject.title}" (id: ${options.activeObject.id}) open. If they say "this", "here" or otherwise don't name a document, act on this object without asking for its title. If they explicitly name a different document, use search_objects to find that one instead.`,
    );
  }
  if (options.purposeInstructions) {
    parts.push(`Additional context about this workspace, set by its owner: ${options.purposeInstructions}`);
  }
  return parts.join(" ");
}

/**
 * Keeps only the most recent `limit` visible (user/assistant) chat turns
 * plus the message just sent, cutting at a clean turn boundary so a `tool`
 * row is never left dangling without the assistant call that produced it
 * (tool rows always follow their assistant call in `messages`, oldest-first,
 * never precede it). `limit <= 0` keeps just the message just sent.
 */
function limitHistory(messages: AiChatMessage[], limit: number): AiChatMessage[] {
  if (limit <= 0) return messages.slice(-1);
  const visibleIndices: number[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "tool") visibleIndices.push(index);
  });
  const keep = limit + 1; // +1 for the message just sent, on top of `limit` prior turns
  if (visibleIndices.length <= keep) return messages;
  return messages.slice(visibleIndices[visibleIndices.length - keep]);
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
export async function sendChatMessage(userId: string, workspaceId: string, userMessage: string, activeObjectId: string | null = null): Promise<AiChatMessage[]> {
  const config = await getDecryptedWorkspaceAiConfig(workspaceId);
  if (!config) throw badRequest("No AI provider configured for this workspace - ask a workspace owner to set one up in Settings");

  const adapter = getProviderAdapter(config.provider);
  const activeTools: AiTool[] = config.activityFeedEnabled ? [...AI_TOOLS, LIST_RECENT_ACTIVITY_TOOL] : AI_TOOLS;
  const toolDefs = activeTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: toolParametersJsonSchema(tool) }));

  // Informational only (id + title, not the object's content) - lets the user say
  // "update this" instead of naming the object; ignored if it's gone or not in this workspace.
  let activeObject: { id: string; title: string } | null = null;
  if (activeObjectId) {
    try {
      const object = await getObject(activeObjectId);
      if (object.workspaceId === workspaceId) activeObject = { id: object.id, title: object.title };
    } catch {
      activeObject = null;
    }
  }

  const appended: AiChatMessage[] = [];
  const userRow = await appendChatMessage(userId, workspaceId, { role: "user", content: userMessage });
  appended.push(userRow);

  const history = limitHistory(await listChatMessages(userId, workspaceId), config.chatHistoryLimit).map(toChatMessage);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    await assertBudgetNotExceeded(workspaceId);
    const result = await adapter.chat({
      apiKey: config.apiKey,
      baseUrl: resolveBaseUrl(config.provider, config.baseUrl),
      model: config.model,
      systemPrompt: systemPrompt(workspaceId, { purposeInstructions: config.purposeInstructions, activeObject }),
      messages: history,
      tools: toolDefs,
    });
    await recordTokenUsage(workspaceId, result.usage.promptTokens, result.usage.completionTokens);

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
      const tool = activeTools.find((t) => t.name === call.name);
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
 * is the host object's title + its blocks rendered to Markdown (so prompts
 * like "summarize this page" have something to work with), or `null` when
 * the block's "include page context" toggle is off - the common/default
 * case, since sending it is an explicit per-request opt-in.
 */
export async function generateBlockAnswer(workspaceId: string, prompt: string, context: string | null): Promise<string> {
  const config = await getDecryptedWorkspaceAiConfig(workspaceId);
  if (!config) throw badRequest("No AI provider configured for this workspace - ask a workspace owner to set one up in Settings");

  await assertBudgetNotExceeded(workspaceId);
  const adapter = getProviderAdapter(config.provider);
  const result = await adapter.chat({
    apiKey: config.apiKey,
    baseUrl: resolveBaseUrl(config.provider, config.baseUrl),
    model: config.model,
    systemPrompt:
      "You are an AI block embedded inline in a page of a notes app called Notorious. Answer the user's prompt directly and concisely, formatted as Markdown. You have no tools - use only the prompt (and the page context below, if given) to answer.",
    messages: [{ role: "user", content: context ? `Page context:\n${context}\n\n---\n\nPrompt: ${prompt}` : prompt }],
    tools: [],
  });
  await recordTokenUsage(workspaceId, result.usage.promptTokens, result.usage.completionTokens);
  return result.content ?? "";
}
