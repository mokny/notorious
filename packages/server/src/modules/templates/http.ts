import dns from "node:dns/promises";
import type { HttpMethod } from "@notorious/shared";
import { isPrivateAddress } from "../linkPreview/ssrf.js";

const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = "Notorious-Template/1.0 (+self-hosted)";

export interface HttpCallDescriptor {
  method: HttpMethod;
  url: string;
  headers: [string, string][];
  body: string | null;
}

export interface HttpCallResponse {
  status: number;
  ok: boolean;
  body: string;
  headers: Record<string, string>;
}

async function assertReachable(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported");
  }
  const hostname = url.hostname;
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "0") {
    throw new Error(`"${hostname}" isn't reachable`);
  }
  let address: string;
  try {
    address = (await dns.lookup(hostname)).address;
  } catch {
    throw new Error(`Could not resolve "${hostname}"`);
  }
  if (isPrivateAddress(address)) {
    throw new Error(`"${hostname}" isn't reachable`);
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    text += decoder.decode(value, { stream: true });
  }
  void reader.cancel().catch(() => {});
  return text;
}

/**
 * Performs one `http.*(...)` template call (see parser.ts's `httpRequest` Expr
 * and renderer.ts's collection/resolution pass). Gated by the
 * `allow_template_http_requests` instance setting (see
 * modules/instanceSettings/service.ts) - the caller is expected to have
 * already checked that before ever reaching this function.
 *
 * This is a stronger SSRF vector than linkPreview's `fetchLinkPreview`
 * (modules/linkPreview/service.ts, whose own doc comment covers the same
 * basic guards): a link preview only ever runs on behalf of the one user who
 * pasted that specific URL, for themselves. A `http.*(...)` call sits in a
 * *template* - the server re-issues that request on behalf of *every*
 * subsequent viewer of the page, including anonymous share-link visitors,
 * with no per-viewer confirmation. So on top of linkPreview's http/https-only
 * + DNS-resolved-address-against-private/loopback/link-local/metadata-ranges
 * check, this also re-validates *every redirect hop* the same way (manual
 * redirect handling, capped at `MAX_REDIRECTS`) instead of following
 * blindly - closes the "first hop looks public, redirects to an internal
 * address" gap that linkPreview's own comment accepts as a tradeoff for a
 * lower-stakes, single-user feature.
 *
 * Still not a complete defense: DNS-rebinding between the resolve check and
 * the actual connection (both here and in fetch's own internal resolution)
 * isn't pinned, and a slow/large response is only bounded by the timeout and
 * byte cap below, not by anything smarter. Good enough for a self-hosted,
 * opt-in instance feature; not something to expose to untrusted public
 * multi-tenant workspaces without more work.
 */
export async function performHttpCall(call: HttpCallDescriptor): Promise<HttpCallResponse> {
  let target: URL;
  try {
    target = new URL(call.url);
  } catch {
    throw new Error(`"${call.url}" is not a valid URL`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let redirects = 0; ; redirects++) {
      await assertReachable(target);
      const response = await fetch(target, {
        method: call.method,
        redirect: "manual",
        signal: controller.signal,
        headers: [["User-Agent", USER_AGENT], ...call.headers],
        body: call.body === null ? undefined : call.body,
      });

      const location = response.headers.get("location");
      if (REDIRECT_STATUSES.has(response.status) && location) {
        if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects");
        target = new URL(location, target);
        continue;
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const body = await readCapped(response, MAX_RESPONSE_BYTES);
      return { status: response.status, ok: response.ok, body, headers };
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
