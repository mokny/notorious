-- @mention support (see utils/mentions.ts, modules/notifications/service.ts's
-- notifyMentionedUsers) - extends the existing comment-thread `notifications`
-- table instead of adding a parallel one. `source` distinguishes the
-- pre-existing "you're part of this comment thread" row (`comment`) from a
-- real @mention inside a comment/block/text-property (`mention-comment`/
-- `mention-block`/`mention-field`). `block_id`/`field_key` are the deep-link
-- anchor for the two content-based mention sources; `comment_id` (pre-existing)
-- already covers `comment`/`mention-comment`.
ALTER TABLE notifications ADD COLUMN source TEXT NOT NULL DEFAULT 'comment';
ALTER TABLE notifications ADD COLUMN block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN field_key TEXT;
