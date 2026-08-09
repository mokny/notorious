import { eq, and, asc } from "drizzle-orm";
import type { WorkspaceAiConfigSummary, AiConfiguredWorkspace, AiChatMessage, AiToolCall, SaveWorkspaceAiConfigInput, AiUsageResetInterval } from "@notorious/shared";
import { db } from "../../db/client.js";
import { workspaceAiConfigs, aiChatMessages, workspaces, workspaceMembers } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { badRequest } from "../../lib/httpError.js";
import { notifyUser } from "../push/service.js";

export interface DecryptedAiConfig {
  provider: "openai" | "anthropic" | "google" | "openai-compatible";
  model: string;
  baseUrl: string | null;
  apiKey: string;
}

function toSummary(row: typeof workspaceAiConfigs.$inferSelect | undefined): WorkspaceAiConfigSummary {
  if (!row) return { configured: false, provider: null, model: null, baseUrl: null, maxTokenBudget: null, consumedTokens: 0, usageResetInterval: null, usageResetAt: null };
  return {
    configured: true,
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl,
    maxTokenBudget: row.maxTokenBudget,
    consumedTokens: row.consumedTokens,
    usageResetInterval: row.usageResetInterval,
    usageResetAt: row.usageResetAt,
  };
}

/** Adds one interval unit to `from` - shared by the first save (to seed `usageResetAt`) and the scheduler (each reset tick). */
export function nextResetAt(interval: AiUsageResetInterval, from: Date): string {
  const next = new Date(from);
  if (interval === "hourly") next.setUTCHours(next.getUTCHours() + 1);
  else if (interval === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (interval === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

export async function getWorkspaceAiConfigSummary(workspaceId: string): Promise<WorkspaceAiConfigSummary> {
  const rows = await db.select().from(workspaceAiConfigs).where(eq(workspaceAiConfigs.workspaceId, workspaceId)).limit(1);
  return toSummary(rows[0]);
}

/** Every workspace this user belongs to that has AI configured - powers the pinned "Notorious AI" entry in the chat overlay (see ConversationList.tsx), one per workspace rather than a single "current workspace" concept the overlay doesn't otherwise have. */
export async function listAiConfiguredWorkspacesForUser(userId: string): Promise<AiConfiguredWorkspace[]> {
  return db
    .select({ workspaceId: workspaces.id, workspaceName: workspaces.name })
    .from(workspaceAiConfigs)
    .innerJoin(workspaces, eq(workspaces.id, workspaceAiConfigs.workspaceId))
    .innerJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, userId)))
    .orderBy(asc(workspaces.name));
}

/** Never exposed over HTTP - only `agent.ts` reads the decrypted key, right before calling the provider. */
export async function getDecryptedWorkspaceAiConfig(workspaceId: string): Promise<DecryptedAiConfig | null> {
  const rows = await db.select().from(workspaceAiConfigs).where(eq(workspaceAiConfigs.workspaceId, workspaceId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, apiKey: decrypt(row.apiKey) };
}

export async function saveWorkspaceAiConfig(workspaceId: string, input: SaveWorkspaceAiConfigInput): Promise<WorkspaceAiConfigSummary> {
  const now = nowIso();
  const existing = await db.select().from(workspaceAiConfigs).where(eq(workspaceAiConfigs.workspaceId, workspaceId)).limit(1);
  const row = existing[0];
  const intervalChanged = !row || row.usageResetInterval !== input.usageResetInterval;
  const budgetRaisedOrCleared = row && (input.maxTokenBudget == null || (row.maxTokenBudget != null && input.maxTokenBudget > row.maxTokenBudget));
  const values = {
    provider: input.provider,
    baseUrl: input.baseUrl ?? null,
    model: input.model,
    apiKey: encrypt(input.apiKey),
    maxTokenBudget: input.maxTokenBudget ?? null,
    usageResetInterval: input.usageResetInterval,
    usageResetAt: intervalChanged ? nextResetAt(input.usageResetInterval, new Date()) : row!.usageResetAt,
    budgetNotifiedAt: budgetRaisedOrCleared ? null : (row?.budgetNotifiedAt ?? null),
    updatedAt: now,
  };
  if (row) {
    await db.update(workspaceAiConfigs).set(values).where(eq(workspaceAiConfigs.workspaceId, workspaceId));
  } else {
    await db.insert(workspaceAiConfigs).values({ workspaceId, ...values, consumedTokens: 0, createdAt: now });
  }
  return getWorkspaceAiConfigSummary(workspaceId);
}

export async function deleteWorkspaceAiConfig(workspaceId: string): Promise<void> {
  await db.delete(workspaceAiConfigs).where(eq(workspaceAiConfigs.workspaceId, workspaceId));
}

/** Throws if the workspace has a budget and has already used it up - called right before every provider request. On the first call after the budget is hit, also notifies the workspace owner. */
export async function assertBudgetNotExceeded(workspaceId: string): Promise<void> {
  const rows = await db.select().from(workspaceAiConfigs).where(eq(workspaceAiConfigs.workspaceId, workspaceId)).limit(1);
  const row = rows[0];
  if (!row || row.maxTokenBudget == null) return;
  if (row.consumedTokens < row.maxTokenBudget) return;

  if (!row.budgetNotifiedAt) {
    await db.update(workspaceAiConfigs).set({ budgetNotifiedAt: nowIso() }).where(eq(workspaceAiConfigs.workspaceId, workspaceId));
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (workspace) {
      await notifyUser(workspace.ownerId, {
        title: "AI token budget reached",
        body: `"${workspace.name}" has used its monthly AI token budget (${row.maxTokenBudget} tokens). AI requests are blocked until the budget resets or you raise it.`,
        url: `/w/${workspaceId}/settings`,
      });
    }
  }
  throw badRequest("This workspace has reached its AI token budget - ask a workspace owner to raise it in Settings, or wait for the next reset.");
}

export async function recordTokenUsage(workspaceId: string, promptTokens: number, completionTokens: number): Promise<void> {
  const rows = await db.select({ consumedTokens: workspaceAiConfigs.consumedTokens }).from(workspaceAiConfigs).where(eq(workspaceAiConfigs.workspaceId, workspaceId)).limit(1);
  const row = rows[0];
  if (!row) return;
  await db
    .update(workspaceAiConfigs)
    .set({ consumedTokens: row.consumedTokens + promptTokens + completionTokens })
    .where(eq(workspaceAiConfigs.workspaceId, workspaceId));
}

function toAiChatMessage(row: typeof aiChatMessages.$inferSelect): AiChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    toolCalls: row.toolCalls ? (JSON.parse(row.toolCalls) as AiToolCall[]) : null,
    toolCallId: row.toolCallId,
    createdAt: row.createdAt,
  };
}

export async function listChatMessages(userId: string, workspaceId: string): Promise<AiChatMessage[]> {
  const rows = await db
    .select()
    .from(aiChatMessages)
    .where(and(eq(aiChatMessages.userId, userId), eq(aiChatMessages.workspaceId, workspaceId)))
    .orderBy(asc(aiChatMessages.createdAt));
  return rows.map(toAiChatMessage);
}

export async function appendChatMessage(
  userId: string,
  workspaceId: string,
  message: { role: "user" | "assistant" | "tool"; content: string | null; toolCalls?: AiToolCall[] | null; toolCallId?: string | null },
): Promise<AiChatMessage> {
  const row = {
    id: newId(),
    userId,
    workspaceId,
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    toolCallId: message.toolCallId ?? null,
    createdAt: nowIso(),
  };
  await db.insert(aiChatMessages).values(row);
  return toAiChatMessage(row);
}

export async function clearChatHistory(userId: string, workspaceId: string): Promise<void> {
  await db.delete(aiChatMessages).where(and(eq(aiChatMessages.userId, userId), eq(aiChatMessages.workspaceId, workspaceId)));
}
