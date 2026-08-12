import cron from "node-cron";
import { findDueFeedSources, pollFeedSource } from "./service.js";

/** Starts the once-a-minute job that polls every feed_source whose `nextRunAt` is due - mirrors modules/backup/scheduler.ts. Each source is processed independently so one feed's failure can't block the others. Call once at server boot. */
export function startFeedScheduler(): void {
  cron.schedule("* * * * *", () => {
    findDueFeedSources()
      .then((rows) => Promise.all(rows.map((row) => pollFeedSource(row).catch((error: unknown) => {
        console.error(`Feed poll failed for feed source ${row.id}:`, error);
      }))))
      .catch((error: unknown) => {
        console.error("Feed scheduler failed:", error);
      });
  });
}
