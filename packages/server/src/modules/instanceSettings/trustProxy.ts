import ipaddr from "ipaddr.js";
import { getTrustProxyConfigSync } from "./service.js";

/** Fastify's `trustProxy` option, called synchronously per-request by the `proxy-addr` library it
 * uses internally: `address` is each hop in the chain (socket peer first, then walking back through
 * X-Forwarded-For), and returning true means "trust this hop's forwarded header, keep walking
 * further back". Reads the admin-configurable allowlist fresh on every call (see
 * getTrustProxyConfigSync) so a toggle in the admin UI takes effect immediately, no restart needed.
 * See docs/NGINX.md for the operator-facing setup instructions. */
export function trustProxyFn(address: string): boolean {
  const { enabled, addresses } = getTrustProxyConfigSync();
  if (!enabled || addresses.trim() === "") return false;

  let candidate: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    candidate = ipaddr.process(address);
  } catch {
    return false;
  }

  return addresses
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      try {
        const range: [ipaddr.IPv4 | ipaddr.IPv6, number] = entry.includes("/")
          ? ipaddr.parseCIDR(entry)
          : [ipaddr.parse(entry), candidate.kind() === "ipv6" ? 128 : 32];
        if (range[0].kind() !== candidate.kind()) return false;
        return candidate.match(range);
      } catch {
        return false;
      }
    });
}
