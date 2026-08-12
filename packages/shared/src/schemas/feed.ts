import { z } from "zod";

/** Allowed poll intervals for a feed source, in minutes - 5/15/30/60min, 6h, 12h, 24h. */
export const FEED_INTERVAL_MINUTES = [5, 15, 30, 60, 360, 720, 1440] as const;
export type FeedIntervalMinutes = (typeof FEED_INTERVAL_MINUTES)[number];

/** Max number of feed_sources rows a single block may have - see modules/feeds/service.ts's `createFeedSource`. */
export const MAX_FEED_SOURCES_PER_BLOCK = 10;

/** Badge color palette a feed can be assigned - a fixed named set (not an arbitrary hex picker) so contrast/dark-mode is guaranteed, same reasoning as CalendarBlock.tsx's object-type palette. `null` means "auto": the web app derives a stable color from the feed's id (see RssFeedBlock.tsx's `colorFor`), which needs no server-side randomness or extra column. */
export const FEED_BADGE_COLORS = ["blue", "emerald", "amber", "purple", "pink", "cyan", "orange", "teal"] as const;
export type FeedBadgeColor = (typeof FEED_BADGE_COLORS)[number];

/** Discovery cooldown-free lookup: given a page or feed URL, find candidate RSS/Atom feed(s). */
export const discoverFeedSchema = z.object({
  url: z.string().min(1).max(2000),
});
export type DiscoverFeedInput = z.infer<typeof discoverFeedSchema>;

/** One candidate feed found by discovery (from `<link rel="alternate">` tags, or the URL itself if it already parses as a feed). */
export interface DiscoveredFeed {
  url: string;
  title: string | null;
}

export interface DiscoverFeedResult {
  discovered: DiscoveredFeed[];
}

const badgeColorSchema = z.enum(FEED_BADGE_COLORS);

export const createFeedSourceSchema = z.object({
  url: z.string().min(1).max(2000),
  displayName: z.string().max(200).optional(),
  intervalMinutes: z.number().int().refine((n): n is FeedIntervalMinutes => (FEED_INTERVAL_MINUTES as readonly number[]).includes(n), {
    message: `intervalMinutes must be one of ${FEED_INTERVAL_MINUTES.join(", ")}`,
  }),
  badgeColor: badgeColorSchema.nullable().optional(),
});
export type CreateFeedSourceInput = z.infer<typeof createFeedSourceSchema>;

export const updateFeedSourceSchema = z.object({
  displayName: z.string().max(200).nullable().optional(),
  intervalMinutes: z
    .number()
    .int()
    .refine((n): n is FeedIntervalMinutes => (FEED_INTERVAL_MINUTES as readonly number[]).includes(n), {
      message: `intervalMinutes must be one of ${FEED_INTERVAL_MINUTES.join(", ")}`,
    })
    .optional(),
  badgeColor: badgeColorSchema.nullable().optional(),
});
export type UpdateFeedSourceInput = z.infer<typeof updateFeedSourceSchema>;

/** One subscribed feed on a block - see modules/feeds/service.ts. Items are fetched separately (`GET .../feed-items`), never embedded here. */
export interface FeedSource {
  id: string;
  blockId: string;
  url: string;
  displayName: string | null;
  resolvedTitle: string | null;
  faviconUrl: string | null;
  badgeColor: FeedBadgeColor | null;
  intervalMinutes: FeedIntervalMinutes;
  nextRunAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
}

/** One cached item from a feed, annotated with its source's display label for the UI badge - see `GET /api/v1/blocks/:blockId/feed-items`. */
export interface FeedItem {
  id: string;
  feedSourceId: string;
  guid: string;
  title: string;
  link: string;
  publishedAt: string | null;
  descriptionText: string | null;
  imageUrl: string | null;
  createdAt: string;
  /** `feedSources.displayName ?? feedSources.resolvedTitle ?? feedSources.url` - precomputed server-side so the UI badge never has to join. */
  sourceLabel: string;
  /** The source site's favicon, for the UI to fall back to when `imageUrl` is null - see feedSources.faviconUrl. */
  sourceFaviconUrl: string | null;
  /** The source feed's explicitly chosen badge color, or null for "auto" (see FEED_BADGE_COLORS). */
  sourceBadgeColor: FeedBadgeColor | null;
}
