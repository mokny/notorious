import dns from "node:dns/promises";
import { badRequest } from "../../lib/httpError.js";
import { isPrivateAddress } from "./ssrf.js";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES_SCANNED = 200_000;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HEAD_CLOSE_RE = /<\/head\s*>/i;
const LINK_TAG_RE = /<link\b[^>]*>/gi;
const REL_ATTR_RE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i;
const HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function firstAttrMatch(re: RegExp, tag: string): string | null {
  const match = re.exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

/** Finds the best `<link rel="icon">`-family href in `html`, preferring a plain icon over an apple-touch-icon (usually an oversized PNG meant for iOS homescreens, not a great fit for a small inline icon). */
function extractFaviconHref(html: string): string | null {
  let plain: string | null = null;
  let fallback: string | null = null;

  for (const match of html.matchAll(LINK_TAG_RE)) {
    const tag = match[0];
    const rel = firstAttrMatch(REL_ATTR_RE, tag)?.toLowerCase();
    const href = firstAttrMatch(HREF_ATTR_RE, tag);
    if (!rel || !href) continue;
    const tokens = rel.split(/\s+/);
    if (!tokens.some((token) => token.includes("icon"))) continue;

    if (!fallback) fallback = href;
    if (tokens.some((token) => token === "icon" || token === "shortcut")) {
      plain = href;
      break;
    }
  }

  return plain ?? fallback;
}

export interface LinkPreview {
  title: string | null;
  icon: string | null;
}

/**
 * Fetches a user-supplied URL and pulls out its `<title>` and favicon, for
 * the bookmark block's "auto-fill" convenience (both remain freely editable
 * afterwards - see BookmarkBlock.tsx). This is the one place in the app that
 * makes a server-side HTTP request to an address a user typed in, which is a
 * classic SSRF vector (probing the server's own internal network/cloud
 * metadata endpoint via a URL that resolves to it) - guarded by: http/https
 * only, a DNS-resolved-address check against private/loopback/link-local
 * ranges (blocks the common "paste an internal URL" case; a full defense
 * against DNS-rebinding would additionally need to pin the fetch to that
 * exact resolved address, which felt like overkill for a best-effort lookup
 * that only ever returns data back to the same user who supplied the URL), a
 * short timeout, and a byte cap so a huge or slow-loris response can't tie
 * up the request.
 *
 * The favicon URL is returned as-is (resolved to an absolute address) rather
 * than fetched/proxied server-side - the browser loads it directly, same as
 * any other `<img>`, so there's no second server-side request (and no
 * matching SSRF surface) to guard.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw badRequest("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest("Only http/https URLs are supported");
  }

  const hostname = url.hostname;
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "0") {
    throw badRequest("That host isn't reachable");
  }

  let resolvedAddress: string;
  try {
    resolvedAddress = (await dns.lookup(hostname)).address;
  } catch {
    return { title: null, icon: null };
  }
  if (isPrivateAddress(resolvedAddress)) {
    throw badRequest("That host isn't reachable");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "NotoriousLinkPreview/1.0 (+self-hosted)" },
    });
    if (!response.ok || !response.body) return { title: null, icon: null };
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) return { title: null, icon: null };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES_SCANNED) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      html += decoder.decode(value, { stream: true });
      // Keep reading until we have both, the page's <head> closes, or we hit
      // the byte cap - a favicon <link> can appear either before or after
      // <title>, so stopping the moment just the title is found (as before)
      // would miss favicons declared later in <head>.
      if (TITLE_RE.test(html) && extractFaviconHref(html)) break;
      if (HEAD_CLOSE_RE.test(html)) break;
    }
    void reader.cancel().catch(() => {});

    const titleMatch = html.match(TITLE_RE);
    const title = titleMatch?.[1]
      ? decodeHtmlEntities(titleMatch[1].trim().replace(/\s+/g, " ")).slice(0, 300) || null
      : null;

    let icon: string | null = null;
    const href = extractFaviconHref(html) ?? "/favicon.ico"; // common convention when no <link rel="icon"> is declared
    try {
      const resolved = new URL(href, url);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") icon = resolved.toString();
    } catch {
      icon = null;
    }

    return { title, icon };
  } catch {
    return { title: null, icon: null };
  } finally {
    clearTimeout(timeout);
  }
}
