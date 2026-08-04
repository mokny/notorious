import cron from "node-cron";
import { cleanupExpiredInboxItems } from "./service.js";

/**
 * Sweeps expired share-inbox temp files/rows every 15 minutes. The intake
 * route already runs this same cleanup on every share (the overwhelmingly
 * common case) - this interval job only matters if the app sits idle with an
 * abandoned share past its 1h TTL. Call once at server boot.
 */
export function startShareInboxCleanup(): void {
  cron.schedule("*/15 * * * *", () => {
    cleanupExpiredInboxItems().catch((error: unknown) => {
      console.error("Share inbox cleanup failed:", error);
    });
  });
}
