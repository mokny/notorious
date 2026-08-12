import type { DiscoveredFeed } from "@notorious/shared";

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const REL_ATTR_RE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i;
const TYPE_ATTR_RE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i;
const HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i;
const TITLE_ATTR_RE = /\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i;

const FEED_MIME_TYPES = new Set(["application/rss+xml", "application/atom+xml"]);

function firstAttrMatch(re: RegExp, tag: string): string | null {
  const match = re.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Scans an HTML document for `<link rel="alternate" type="application/rss+xml|atom+xml">`
 * tags - the standard way a page advertises its feed(s) - and resolves each
 * `href` to an absolute URL against `baseUrl`. Used by the "discover" step
 * of `POST /api/v1/blocks/:blockId/feed-sources/discover` (see service.ts's
 * `discoverFeeds`), which falls back to trying the original URL as a feed
 * directly when this finds nothing.
 */
export function discoverFeedLinksInHtml(html: string, baseUrl: string): DiscoveredFeed[] {
  const results: DiscoveredFeed[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(LINK_TAG_RE)) {
    const tag = match[0];
    const rel = firstAttrMatch(REL_ATTR_RE, tag)?.toLowerCase();
    if (!rel || !rel.split(/\s+/).includes("alternate")) continue;
    const type = firstAttrMatch(TYPE_ATTR_RE, tag)?.toLowerCase();
    if (!type || !FEED_MIME_TYPES.has(type)) continue;
    const href = firstAttrMatch(HREF_ATTR_RE, tag);
    if (!href) continue;

    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const titleAttr = firstAttrMatch(TITLE_ATTR_RE, tag);
    results.push({ url: resolved, title: titleAttr ? decodeHtmlEntities(titleAttr) : null });
  }

  return results;
}
