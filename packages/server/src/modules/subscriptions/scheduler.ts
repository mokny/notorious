import cron from "node-cron";
import { findDueSubscriptionNotifications, deliverPendingSubscriptionNotification } from "./service.js";

/**
 * Starts the once-a-minute sweep that delivers debounced subscription
 * notifications once an object's activity has gone quiet for the debounce
 * window - a DB-backed queue (see service.ts's `enqueueSubscriberNotifications`)
 * rather than an in-memory timer, so a pending bundle survives a server
 * restart instead of silently never firing. Call once at server boot.
 */
export function startSubscriptionScheduler(): void {
  cron.schedule("* * * * *", () => {
    findDueSubscriptionNotifications()
      .then((pending) => pending.reduce((chain, row) => chain.then(() => deliverPendingSubscriptionNotification(row)), Promise.resolve()))
      .catch((error: unknown) => {
        console.error("Subscription notification scheduler failed:", error);
      });
  });
}
