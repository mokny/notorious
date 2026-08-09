DROP TABLE ai_configs;

CREATE TABLE workspace_ai_configs (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  base_url TEXT,
  model TEXT NOT NULL,
  api_key TEXT NOT NULL,
  max_token_budget INTEGER,
  consumed_tokens INTEGER NOT NULL DEFAULT 0,
  usage_reset_interval TEXT NOT NULL DEFAULT 'monthly',
  usage_reset_at TEXT NOT NULL,
  budget_notified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
