-- Tracks which reminders have already been pushed, so the scheduler never
-- sends the same reminder twice even across server restarts.
CREATE TABLE sent_reminders (
  object_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  reminder_value TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (object_id, property_id, reminder_value)
);
