import dns from "node:dns/promises";
import { badRequest } from "../../lib/httpError.js";
import { isPrivateAddress } from "./ssrf.js";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES_SCANNED = 200_000;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

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

/**
 * Fetches a user-supplied URL and pulls out its `<title>`, for the bookmark
 * block's "auto-fill the title" convenience. This is the one place in the
 * app that makes a server-side HTTP request to an address a user typed in,
 * which is a classic SSRF vector (probing the server's own internal
 * network/cloud metadata endpoint via a URL that resolves to it) - guarded
 * by: http/https only, a DNS-resolved-address check against private/
 * loopback/link-local ranges (blocks the common "paste an internal URL"
 * case; a full defense against DNS-rebinding would additionally need to pin
 * the fetch to that exact resolved address, which felt like overkill for a
 * best-effort title lookup that only ever returns a title string back to the
 * same user who supplied the URL), a short timeout, and a byte cap so a huge
 * or slow-loris response can't tie up the request.
 */
export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
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
    return null;
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
    if (!response.ok || !response.body) return null;
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let received = 0;
    while (received < MAX_BYTES_SCANNED) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      html += decoder.decode(value, { stream: true });
      if (TITLE_RE.test(html)) break;
    }
    void reader.cancel().catch(() => {});

    const match = html.match(TITLE_RE);
    if (!match?.[1]) return null;
    const title = decodeHtmlEntities(match[1].trim().replace(/\s+/g, " ")).slice(0, 300);
    return title || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
