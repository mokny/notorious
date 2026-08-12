import dns from "node:dns/promises";
import { badRequest } from "../../lib/httpError.js";
import { isPrivateAddress } from "../linkPreview/ssrf.js";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;

/**
 * Fetches a user-supplied URL (a feed URL, or a page to discover feed links
 * on) as text, guarded against SSRF the same way modules/linkPreview/
 * service.ts is: http/https only, a DNS-resolved-address check against
 * private/loopback/link-local ranges, a short timeout, and a byte cap
 * (streamed, aborted the moment it's exceeded rather than buffered past it).
 * Used for both discovery's HTML fetch and a feed's own XML fetch - the two
 * modes share every safety property, only what they do with the resulting
 * text differs.
 */
export async function fetchTextSafely(rawUrl: string): Promise<string> {
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
    throw badRequest("That host could not be resolved");
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
      headers: { "User-Agent": "NotoriousFeedReader/1.0 (+self-hosted)" },
    });
    if (!response.ok || !response.body) {
      throw badRequest(`Fetch failed: HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_BYTES) {
        void reader.cancel().catch(() => {});
        throw badRequest("Response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw badRequest("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
