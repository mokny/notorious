-- RSS Feed block (see modules/feeds/) - one row per (block, feed URL) subscription,
-- plus a cache of that feed's items. See db/schema.ts's doc comments on
-- feedSources/feedItems for the reasoning behind each column.
CREATE TABLE feed_sources (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  display_name TEXT,
  resolved_title TEXT,
  interval_minutes INTEGER NOT NULL,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_feed_sources_next_run_at ON feed_sources(next_run_at);

CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  feed_source_id TEXT NOT NULL REFERENCES feed_sources(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  published_at TEXT,
  description_text TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_feed_items_source_guid ON feed_items(feed_source_id, guid);
CREATE INDEX idx_feed_items_published_at ON feed_items(published_at);
