import { eq, and, asc } from "drizzle-orm";
import type { AiConfigSummary, AiChatMessage, AiToolCall, SaveAiConfigInput } from "@notorious/shared";
import { db } from "../../db/client.js";
import { aiConfigs, aiChatMessages } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { encrypt, decrypt } from "../../lib/crypto.js";

export interface DecryptedAiConfig {
  provider: "openai" | "anthropic" | "openai-compatible";
  model: string;
  baseUrl: string | null;
  apiKey: string;
}

export async function getAiConfigSummary(userId: string): Promise<AiConfigSummary> {
  const rows = await db.select().from(aiConfigs).where(eq(aiConfigs.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return { configured: false, provider: null, model: null, baseUrl: null };
  return { configured: true, provider: row.provider, model: row.model, baseUrl: row.baseUrl };
}

/** Never exposed over HTTP - only `agent.ts` reads the decrypted key, right before calling the provider. */
export async function getDecryptedAiConfig(userId: string): Promise<DecryptedAiConfig | null> {
  const rows = await db.select().from(aiConfigs).where(eq(aiConfigs.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return { provider: row.provider, model: row.model, baseUrl: row.baseUrl, apiKey: decrypt(row.apiKey) };
}

export async function saveAiConfig(userId: string, input: SaveAiConfigInput): Promise<AiConfigSummary> {
  const now = nowIso();
  const existing = await db.select({ userId: aiConfigs.userId }).from(aiConfigs).where(eq(aiConfigs.userId, userId)).limit(1);
  const values = {
    provider: input.provider,
    baseUrl: input.baseUrl ?? null,
    model: input.model,
    apiKey: encrypt(input.apiKey),
    updatedAt: now,
  };
  if (existing[0]) {
    await db.update(aiConfigs).set(values).where(eq(aiConfigs.userId, userId));
  } else {
    await db.insert(aiConfigs).values({ userId, ...values, createdAt: now });
  }
  return getAiConfigSummary(userId);
}

export async function deleteAiConfig(userId: string): Promise<void> {
  await db.delete(aiConfigs).where(eq(aiConfigs.userId, userId));
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
