-- RSS Feed block: cache the source site's favicon URL, used as a per-item
-- fallback in the UI when an item has no thumbnail of its own (see
-- RssFeedBlock.tsx / service.ts's `resolveFavicon`).
ALTER TABLE feed_sources ADD COLUMN favicon_url TEXT;
