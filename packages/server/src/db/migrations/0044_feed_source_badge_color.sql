-- RSS Feed block: user-settable badge color per feed source (null = auto,
-- derived client-side from the feed's id - see RssFeedBlock.tsx's colorFor
-- and shared/src/schemas/feed.ts's FEED_BADGE_COLORS).
ALTER TABLE feed_sources ADD COLUMN badge_color TEXT;
