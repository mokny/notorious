ALTER TABLE workspace_ai_configs ADD COLUMN purpose_instructions TEXT;
ALTER TABLE workspace_ai_configs ADD COLUMN chat_history_limit INTEGER NOT NULL DEFAULT 20;
ALTER TABLE workspace_ai_configs ADD COLUMN activity_feed_enabled INTEGER NOT NULL DEFAULT 0;
