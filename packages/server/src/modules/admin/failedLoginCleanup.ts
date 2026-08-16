import cron from "node-cron";
import { pruneFailedLoginAttempts } from "../auth/service.js";

/**
 * Sweeps `failed_login_attempts` rows older than 30 days once a day - see
 * that table's doc comment in db/schema.ts. Call once at server boot, same
 * pattern as modules/shareTarget/cleanup.ts's `startShareInboxCleanup`.
 */
export function startFailedLoginCleanup(): void {
  cron.schedule("0 3 * * *", () => {
    pruneFailedLoginAttempts().catch((error: unknown) => {
      console.error("Failed login attempts cleanup failed:", error);
    });
  });
}
