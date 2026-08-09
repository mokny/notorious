import crypto from "node:crypto";
import type { TurnCredentials } from "@notorious/shared";
import { env } from "../../env.js";
import { serviceUnavailable } from "../../lib/httpError.js";

const DEFAULT_TTL_SECONDS = 3600;

/**
 * coturn's documented `use-auth-secret` time-limited-credential scheme:
 * `username = "<unix-expiry>:<userId>"`, `password = base64(HMAC-SHA1(secret, username))`.
 * coturn itself validates this against its own `static-auth-secret` config
 * (see scripts/setupCalls.ts's generated `/etc/turnserver.conf`) - no
 * per-user credential storage needed on our side at all.
 *
 * Throws if `TURN_SECRET`/`TURN_DOMAIN` aren't configured - the concrete,
 * loud symptom if an operator flips `callsEnabled` on without ever running
 * `npm run setup-calls` (routes.ts maps this to a 503).
 */
export function getTurnCredentials(userId: string, ttlSeconds = DEFAULT_TTL_SECONDS): TurnCredentials {
  if (!env.turnSecret || !env.turnDomain) {
    throw serviceUnavailable("TURN is not configured - run `npm run setup-calls` on the server first (see docs/DEPLOYMENT.md)");
  }

  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${userId}`;
  const credential = crypto.createHmac("sha1", env.turnSecret).update(username).digest("base64");

  return {
    urls: [`turn:${env.turnDomain}:3478?transport=udp`, `stun:${env.turnDomain}:3478`],
    username,
    credential,
    ttlSeconds,
  };
}
