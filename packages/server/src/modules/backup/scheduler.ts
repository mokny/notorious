import cron from "node-cron";
import { and, eq, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { backupSchedules } from "../../db/schema.js";
import { nowIso } from "../../lib/ids.js";
import { advanceSchedule, runBackupNow } from "./service.js";

async function findDueSchedules(): Promise<(typeof backupSchedules.$inferSelect)[]> {
  const now = nowIso();
  return db
    .select()
    .from(backupSchedules)
    .where(and(eq(backupSchedules.enabled, true), lte(backupSchedules.nextRunAt, now)));
}

async function runDueSchedule(row: typeof backupSchedules.$inferSelect): Promise<void> {
  try {
    await runBackupNow(row.workspaceId);
  } catch (error: unknown) {
    // runBackupNow already records per-destination failures; this only fires
    // for failures before any destination was attempted (e.g. no destinations
    // configured) - still record + advance so the schedule doesn't retry every minute.
    console.error(`Scheduled backup failed for workspace ${row.workspaceId}:`, error);
    await db
      .update(backupSchedules)
      .set({ lastRunAt: nowIso(), lastRunStatus: "failure", lastError: error instanceof Error ? error.message : String(error) })
      .where(eq(backupSchedules.workspaceId, row.workspaceId));
    await advanceSchedule(row);
  }
}

/** Starts the once-a-minute job that runs due scheduled backups. Call once at server boot. */
export function startBackupScheduler(): void {
  cron.schedule("* * * * *", () => {
    findDueSchedules()
      .then((rows) => Promise.all(rows.map(runDueSchedule)))
      .catch((error: unknown) => {
        console.error("Backup scheduler failed:", error);
      });
  });
}
