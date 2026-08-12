import Parser from "rss-parser";
import { and, eq, inArray, lte, notInArray } from "drizzle-orm";
import type {
  CreateFeedSourceInput,
  DiscoveredFeed,
  DiscoverFeedResult,
  FeedIntervalMinutes,
  FeedItem,
  FeedSource,
  UpdateFeedSourceInput,
} from "@notorious/shared";
import { MAX_FEED_SOURCES_PER_BLOCK } from "@notorious/shared";
import { db } from "../../db/client.js";
import { blocks, feedItems, feedSources, objects } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, conflict, notFound, HttpError } from "../../lib/httpError.js";
import { fetchTextSafely } from "./safeFetch.js";
import { discoverFeedLinksInHtml } from "./discovery.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import { fetchLinkPreview } from "../linkPreview/service.js";

const REFRESH_COOLDOWN_MS = 30_000;
const MAX_ITEMS_PER_SOURCE = 50;
const MAX_DESCRIPTION_LENGTH = 500;

type FeedItemCustomFields = { mediaThumbnail?: { $?: { url?: string } }; mediaContent?: { $?: { url?: string } } };

const parser = new Parser<Record<string, never>, FeedItemCustomFields>({
  customFields: {
    item: [
      ["media:thumbnail", "mediaThumbnail"],
      ["media:content", "mediaContent"],
    ],
  },
});

// --- Public mapping ----------------------------------------------------

function toPublicFeedSource(row: typeof feedSources.$inferSelect): FeedSource {
  return {
    id: row.id,
    blockId: row.blockId,
    url: row.url,
    displayName: row.displayName,
    resolvedTitle: row.resolvedTitle,
    faviconUrl: row.faviconUrl,
    intervalMinutes: row.intervalMinutes as FeedIntervalMinutes,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
  };
}

function sourceLabelFor(row: Pick<typeof feedSources.$inferSelect, "displayName" | "resolvedTitle" | "url">): string {
  return row.displayName || row.resolvedTitle || row.url;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function imageUrlFor(item: Parser.Item & FeedItemCustomFields): string | null {
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url;
  if (item.enclosure?.url && (item.enclosure.type ?? "").startsWith("image/")) return item.enclosure.url;
  if (item.enclosure?.url && !item.enclosure.type) return item.enclosure.url;
  return null;
}

function guidFor(item: Parser.Item): string | null {
  return item.guid || item.link || null;
}

// --- Discovery -----------------------------------------------------------

/**
 * Try-HTML-discovery-then-fallback-parse, as specced for
 * `POST /api/v1/blocks/:blockId/feed-sources/discover`: fetch `url` as
 * HTML and look for `<link rel="alternate" type="application/(rss|atom)+xml">`
 * tags; if none are found, fall back to trying to parse `url` itself as a
 * feed directly (a common case: the user already pasted the feed URL, not
 * a page linking to one).
 */
export async function discoverFeeds(url: string): Promise<DiscoverFeedResult> {
  const html = await fetchTextSafely(url);
  const discovered = discoverFeedLinksInHtml(html, url);
  if (discovered.length > 0) return { discovered };

  try {
    const parsed = await parser.parseString(html);
    if (!parsed.items || parsed.items.length === 0) throw new Error("Not a feed");
    const fallback: DiscoveredFeed = { url, title: parsed.title ?? null };
    return { discovered: [fallback] };
  } catch {
    throw badRequest("No RSS/Atom feed could be found at that URL");
  }
}

// --- Fetch + parse ---------------------------------------------------------

interface ParsedFeedItem {
  guid: string;
  title: string;
  link: string;
  publishedAt: string | null;
  descriptionText: string | null;
  imageUrl: string | null;
}

interface ParsedFeed {
  title: string | null;
  /** The feed's own site homepage link (rss-parser's feed-level `link`, distinct from each item's `link`) - used to resolve the site's favicon, see `resolveFavicon`. */
  siteUrl: string | null;
  items: ParsedFeedItem[];
}

async function fetchAndParseFeed(url: string): Promise<ParsedFeed> {
  const xml = await fetchTextSafely(url);
  const parsed = await parser.parseString(xml);

  const items: ParsedFeedItem[] = [];
  for (const item of parsed.items ?? []) {
    const guid = guidFor(item);
    if (!guid) continue;
    const rawDescription = item.contentSnippet || item.summary || item.content || "";
    const descriptionText = rawDescription ? stripHtml(rawDescription).slice(0, MAX_DESCRIPTION_LENGTH) || null : null;
    const publishedAt = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null);
    items.push({
      guid,
      title: item.title || "Untitled",
      link: item.link || url,
      publishedAt: publishedAt && !Number.isNaN(new Date(publishedAt).getTime()) ? publishedAt : null,
      descriptionText,
      imageUrl: imageUrlFor(item),
    });
  }

  return { title: parsed.title ?? null, siteUrl: parsed.link ?? null, items };
}

/**
 * Resolves the source site's favicon so the UI has *something* to show per
 * item even when a feed's own entries carry no thumbnail (most blog/news
 * feeds don't). Reuses `linkPreview`'s existing SSRF-guarded HTML fetch
 * rather than adding a second one - the favicon is hotlinked by the browser
 * afterwards, same as any bookmark icon, so this is a one-time lookup, not a
 * per-item cost. Prefers the feed's own advertised site URL (rss-parser's
 * `link`); falls back to the feed URL's own origin when the feed doesn't
 * declare one. Best-effort: any failure just leaves `faviconUrl` unset.
 */
async function resolveFavicon(feedUrl: string, siteUrl: string | null): Promise<string | null> {
  let target = siteUrl;
  if (!target) {
    try {
      target = new URL(feedUrl).origin;
    } catch {
      return null;
    }
  }
  try {
    const { icon } = await fetchLinkPreview(target);
    return icon;
  } catch {
    return null;
  }
}

// --- CRUD ------------------------------------------------------------------

export async function listFeedSources(blockId: string): Promise<FeedSource[]> {
  const rows = await db.select().from(feedSources).where(eq(feedSources.blockId, blockId));
  return rows.map(toPublicFeedSource);
}

async function upsertItems(feedSourceId: string, parsed: ParsedFeed): Promise<{ newItemCount: number }> {
  const now = nowIso();
  const existing = await db
    .select({ guid: feedItems.guid })
    .from(feedItems)
    .where(eq(feedItems.feedSourceId, feedSourceId));
  const existingGuids = new Set(existing.map((r) => r.guid));

  let newItemCount = 0;
  for (const item of parsed.items) {
    if (!existingGuids.has(item.guid)) newItemCount++;
    await db
      .insert(feedItems)
      .values({
        id: newId(),
        feedSourceId,
        guid: item.guid,
        title: item.title,
        link: item.link,
        publishedAt: item.publishedAt,
        descriptionText: item.descriptionText,
        imageUrl: item.imageUrl,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [feedItems.feedSourceId, feedItems.guid],
        set: {
          title: item.title,
          link: item.link,
          publishedAt: item.publishedAt,
          descriptionText: item.descriptionText,
          imageUrl: item.imageUrl,
        },
      });
  }

  // Trim to the MAX_ITEMS_PER_SOURCE most recent (by publishedAt, falling
  // back to createdAt for items with no publish date) - see schema.ts's doc
  // comment on feedItems.
  const all = await db
    .select({ id: feedItems.id, publishedAt: feedItems.publishedAt, createdAt: feedItems.createdAt })
    .from(feedItems)
    .where(eq(feedItems.feedSourceId, feedSourceId));
  if (all.length > MAX_ITEMS_PER_SOURCE) {
    const sorted = [...all].sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
    const keepIds = sorted.slice(0, MAX_ITEMS_PER_SOURCE).map((r) => r.id);
    await db.delete(feedItems).where(and(eq(feedItems.feedSourceId, feedSourceId), notInArray(feedItems.id, keepIds)));
  }

  return { newItemCount };
}

/** Resolves the object + workspace a block belongs to - needed to broadcast a feed refresh the same way any other block-content change does. */
async function getBlockContext(blockId: string): Promise<{ objectId: string; workspaceId: string; actorId: string } | null> {
  const [block] = await db.select({ objectId: blocks.objectId }).from(blocks).where(eq(blocks.id, blockId)).limit(1);
  if (!block) return null;
  const [object] = await db
    .select({ workspaceId: objects.workspaceId, createdBy: objects.createdBy })
    .from(objects)
    .where(eq(objects.id, block.objectId))
    .limit(1);
  if (!object) return null;
  return { objectId: block.objectId, workspaceId: object.workspaceId, actorId: object.createdBy };
}

/** Runs one feed source's fetch+parse+upsert cycle and persists the result - shared by "create" (immediate first fetch), the manual refresh endpoint, and the scheduler. Never throws: failures are recorded on the row via `lastError` instead. */
export async function runFeedSourceFetch(row: typeof feedSources.$inferSelect): Promise<{ newItemCount: number }> {
  const now = nowIso();
  try {
    const parsed = await fetchAndParseFeed(row.url);
    const { newItemCount } = await upsertItems(row.id, parsed);
    // Resolved once and cached - a site's favicon essentially never changes,
    // so there's no reason to re-fetch it on every poll once it's set. If an
    // earlier attempt failed (still null), this retries on the next poll,
    // which self-heals transient failures at the cost of one extra request
    // per poll for sites that genuinely have no favicon.
    const faviconUrl = row.faviconUrl ?? (await resolveFavicon(row.url, parsed.siteUrl));
    await db
      .update(feedSources)
      .set({
        lastRunAt: now,
        lastError: null,
        resolvedTitle: parsed.title ?? row.resolvedTitle,
        faviconUrl,
      })
      .where(eq(feedSources.id, row.id));
    return { newItemCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(feedSources).set({ lastRunAt: now, lastError: message }).where(eq(feedSources.id, row.id));
    return { newItemCount: 0 };
  }
}

/** Broadcasts a feed's parent object as changed so open clients refetch `feed-items` live - see modules/realtime/activity.ts's `recordAndBroadcast`. Only called when a fetch actually added a new item, not on every poll. */
async function broadcastFeedUpdated(blockId: string): Promise<void> {
  const context = await getBlockContext(blockId);
  if (!context) return;
  await recordAndBroadcast({
    workspaceId: context.workspaceId,
    objectId: context.objectId,
    actorId: context.actorId,
    action: "updated",
    summary: "New RSS feed items were fetched",
    entity: "block",
    entityId: blockId,
    realtimeAction: "updated",
    // Automated background poll, not a user/API edit - must never trigger
    // that object's automation (out of scope for this feature, see the
    // rssFeed block's own spec).
    skipAutomationTrigger: true,
  });
}

export async function createFeedSource(blockId: string, input: CreateFeedSourceInput): Promise<FeedSource> {
  const existingCount = await db.select({ id: feedSources.id }).from(feedSources).where(eq(feedSources.blockId, blockId));
  if (existingCount.length >= MAX_FEED_SOURCES_PER_BLOCK) {
    throw conflict(`A block can have at most ${MAX_FEED_SOURCES_PER_BLOCK} feeds`);
  }

  const now = nowIso();
  const id = newId();
  const nextRunAt = new Date(Date.now() + input.intervalMinutes * 60_000).toISOString();

  await db.insert(feedSources).values({
    id,
    blockId,
    url: input.url,
    displayName: input.displayName ?? null,
    resolvedTitle: null,
    intervalMinutes: input.intervalMinutes,
    nextRunAt,
    lastRunAt: null,
    lastError: null,
    createdAt: now,
  });

  const [row] = await db.select().from(feedSources).where(eq(feedSources.id, id)).limit(1);
  // Immediate synchronous first fetch, so the UI isn't empty right after
  // adding - see spec. Failure just leaves `lastError` set; the row itself
  // still gets created.
  await runFeedSourceFetch(row!);

  const [fresh] = await db.select().from(feedSources).where(eq(feedSources.id, id)).limit(1);
  return toPublicFeedSource(fresh!);
}

export async function updateFeedSource(id: string, input: UpdateFeedSourceInput): Promise<FeedSource> {
  const [existing] = await db.select().from(feedSources).where(eq(feedSources.id, id)).limit(1);
  if (!existing) throw notFound("Feed not found");

  const updates: Partial<typeof feedSources.$inferInsert> = {};
  if (input.displayName !== undefined) updates.displayName = input.displayName;
  if (input.intervalMinutes !== undefined) {
    updates.intervalMinutes = input.intervalMinutes;
    updates.nextRunAt = new Date(Date.now() + input.intervalMinutes * 60_000).toISOString();
  }

  if (Object.keys(updates).length > 0) {
    await db.update(feedSources).set(updates).where(eq(feedSources.id, id));
  }

  const [row] = await db.select().from(feedSources).where(eq(feedSources.id, id)).limit(1);
  return toPublicFeedSource(row!);
}

export async function deleteFeedSource(id: string): Promise<void> {
  await db.delete(feedSources).where(eq(feedSources.id, id));
}

export async function getFeedSource(id: string): Promise<typeof feedSources.$inferSelect> {
  const [row] = await db.select().from(feedSources).where(eq(feedSources.id, id)).limit(1);
  if (!row) throw notFound("Feed not found");
  return row;
}

/** Resolves the blockId a feed source belongs to - for auth (a feed source route is scoped by its own id, not a blockId path param). */
export async function getFeedSourceBlockId(id: string): Promise<string> {
  const row = await getFeedSource(id);
  return row.blockId;
}

/** Manual refresh, enforced 30s cooldown per source (tracked via `lastRunAt`) - synchronous, returns the fresh state. */
export async function refreshFeedSource(id: string): Promise<FeedSource> {
  const row = await getFeedSource(id);
  if (row.lastRunAt) {
    const elapsed = Date.now() - new Date(row.lastRunAt).getTime();
    if (elapsed < REFRESH_COOLDOWN_MS) {
      throw new HttpError(429, "Please wait before refreshing this feed again");
    }
  }

  const { newItemCount } = await runFeedSourceFetch(row);
  if (newItemCount > 0) await broadcastFeedUpdated(row.blockId);

  const [fresh] = await db.select().from(feedSources).where(eq(feedSources.id, id)).limit(1);
  return toPublicFeedSource(fresh!);
}

/** Merged, chronologically-sorted (publishedAt desc, nulls last) items across every feed_source on a block, capped at `limit`, annotated with each item's source label for the UI badge. */
export async function listFeedItemsForBlock(blockId: string, limit: number): Promise<FeedItem[]> {
  const sources = await db.select().from(feedSources).where(eq(feedSources.blockId, blockId));
  if (sources.length === 0) return [];

  const sourceIds = sources.map((s) => s.id);
  const items = await db.select().from(feedItems).where(inArray(feedItems.feedSourceId, sourceIds));

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const merged: FeedItem[] = items.map((item) => {
    const source = sourceById.get(item.feedSourceId)!;
    return {
      id: item.id,
      feedSourceId: item.feedSourceId,
      guid: item.guid,
      title: item.title,
      link: item.link,
      publishedAt: item.publishedAt,
      descriptionText: item.descriptionText,
      imageUrl: item.imageUrl,
      createdAt: item.createdAt,
      sourceLabel: sourceLabelFor(source),
      sourceFaviconUrl: source.faviconUrl,
    };
  });

  merged.sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
  return merged.slice(0, limit);
}

// --- Scheduler support -------------------------------------------------------

export async function findDueFeedSources(): Promise<(typeof feedSources.$inferSelect)[]> {
  const now = nowIso();
  return db.select().from(feedSources).where(lte(feedSources.nextRunAt, now));
}

export async function advanceFeedSource(row: typeof feedSources.$inferSelect): Promise<void> {
  const nextRunAt = new Date(Date.now() + row.intervalMinutes * 60_000).toISOString();
  await db.update(feedSources).set({ nextRunAt }).where(eq(feedSources.id, row.id));
}

/** One poll cycle for a single due feed source - fetch, upsert, advance, and broadcast if anything new landed. Errors are already captured onto the row by `runFeedSourceFetch` - this never throws, so one feed's failure can't block the others in the same poll (see scheduler.ts). */
export async function pollFeedSource(row: typeof feedSources.$inferSelect): Promise<void> {
  const { newItemCount } = await runFeedSourceFetch(row);
  await advanceFeedSource(row);
  if (newItemCount > 0) await broadcastFeedUpdated(row.blockId);
}
