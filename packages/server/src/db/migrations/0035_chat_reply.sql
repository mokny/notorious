-- No ON DELETE CASCADE here (same reasoning as call_id in 0033_calls.sql):
-- deleting the original message must not cascade-delete the reply, since the
-- reply's own content is unrelated - it just loses its quoted preview
-- (service.ts falls back to "message deleted" once the referenced row is
-- soft- or hard-deleted).
ALTER TABLE messages ADD COLUMN reply_to_id TEXT REFERENCES messages(id);
CREATE INDEX idx_messages_reply_to ON messages(reply_to_id);
