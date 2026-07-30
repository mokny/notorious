/**
 * `crypto.randomUUID()` only exists in "secure contexts" (HTTPS or
 * localhost) - on a plain-HTTP deployment it's simply undefined. Calling it
 * directly at module-evaluation time (rather than lazily, inside this
 * function) once crashed the entire bundle before React ever mounted - a
 * blank white page, with no chance for an error boundary to catch it since
 * the crash happened before the app existed (see clientId.ts, the first
 * place this was needed). `crypto.getRandomValues` has no such restriction,
 * so fall back to building a UUID from that instead.
 */
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
