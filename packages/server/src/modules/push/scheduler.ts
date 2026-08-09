import cron from "node-cron";
import { db, sqlite } from "../../db/client.js";
import { sentReminders } from "../../db/schema.js";
import { nowIso } from "../../lib/ids.js";
import { notifyUser } from "./service.js";

interface DueReminder {
  objectId: string;
  workspaceId: string;
  propertyId: string;
  reminderValue: string;
  title: string;
  createdBy: string;
}

/** Finds all `reminder` (datetime) property values that are now due and not yet sent. */
async function findDueReminders(): Promise<DueReminder[]> {
  const now = nowIso();
  const rows = sqlite
    .prepare(
      `SELECT ov.object_id AS objectId, o.workspace_id AS workspaceId, ov.property_id AS propertyId, ov.value AS reminderValue,
              o.title AS title, o.created_by AS createdBy
       FROM object_values ov
       JOIN properties p ON p.id = ov.property_id AND p.key = 'reminder' AND p.type = 'datetime'
       JOIN objects o ON o.id = ov.object_id AND o.archived_at IS NULL
       WHERE ov.value IS NOT NULL AND ov.value != 'null'
         AND json_extract(ov.value, '$') <= ?
         AND NOT EXISTS (
           SELECT 1 FROM sent_reminders sr
           WHERE sr.object_id = ov.object_id AND sr.property_id = ov.property_id
             AND sr.reminder_value = ov.value
         )`,
    )
    .all(now) as DueReminder[];

  return rows;
}

async function sendReminder(reminder: DueReminder): Promise<void> {
  await notifyUser(reminder.createdBy, {
    type: "reminder",
    title: "Reminder",
    body: reminder.title,
    url: `/w/${reminder.workspaceId}/objects/${reminder.objectId}`,
  });

  await db.insert(sentReminders).values({
    objectId: reminder.objectId,
    propertyId: reminder.propertyId,
    reminderValue: reminder.reminderValue,
    sentAt: nowIso(),
  });
}

/** Starts the once-a-minute job that pushes due task reminders. Call once at server boot. */
export function startReminderScheduler(): void {
  cron.schedule("* * * * *", () => {
    findDueReminders()
      .then((reminders) => Promise.all(reminders.map(sendReminder)))
      .catch((error: unknown) => {
        console.error("Reminder scheduler failed:", error);
      });
  });
}
