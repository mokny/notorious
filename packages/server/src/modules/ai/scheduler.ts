import cron from "node-cron";
import { eq, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { workspaceAiConfigs } from "../../db/schema.js";
import { nextResetAt } from "./service.js";

async function findDueResets(): Promise<(typeof workspaceAiConfigs.$inferSelect)[]> {
  const now = new Date().toISOString();
  return db.select().from(workspaceAiConfigs).where(lte(workspaceAiConfigs.usageResetAt, now));
}

async function resetUsage(row: typeof workspaceAiConfigs.$inferSelect): Promise<void> {
  await db
    .update(workspaceAiConfigs)
    .set({
      consumedTokens: 0,
      budgetNotifiedAt: null,
      usageResetAt: nextResetAt(row.usageResetInterval, new Date(row.usageResetAt)),
    })
    .where(eq(workspaceAiConfigs.workspaceId, row.workspaceId));
}

/** Starts the once-a-minute job that resets due workspace AI token budgets. Call once at server boot. */
export function startAiUsageScheduler(): void {
  cron.schedule("* * * * *", () => {
    findDueResets()
      .then((rows) => Promise.all(rows.map(resetUsage)))
      .catch((error: unknown) => {
        console.error("AI usage scheduler failed:", error);
      });
  });
}
